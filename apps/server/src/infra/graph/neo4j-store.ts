import neo4j, { type Driver, type Integer } from "neo4j-driver";
import { requireEnv } from "../../env.js";
import type {
  GraphStore,
  UpsertEntitiesOptions,
  FindRelatedDocumentsOptions,
  FindDocumentsByEntitiesOptions,
  ListEntitiesOptions,
  MergeEntitiesOptions,
  GraphSearchResult,
  GraphEntity,
} from "./graph-store.js";
import { GraphStoreError } from "./graph-store.js";

export function createNeo4jStore(): GraphStore & { close(): Promise<void> } {
  const driver: Driver = neo4j.driver(
    requireEnv("NEO4J_URI"),
    neo4j.auth.basic(requireEnv("NEO4J_USER"), requireEnv("NEO4J_PASSWORD")),
  );

  return {
    async ensureSchema(): Promise<void> {
      const session = driver.session();
      try {
        await session.run(
          `CREATE CONSTRAINT entity_unique IF NOT EXISTS
           FOR (e:Entity) REQUIRE (e.type, e.name, e.userId) IS UNIQUE`,
        );
        await session.run(
          `CREATE INDEX entity_user_id IF NOT EXISTS
           FOR (e:Entity) ON (e.userId)`,
        );
        await session.run(
          `CREATE INDEX document_doc_id IF NOT EXISTS
           FOR (d:Document) ON (d.docId)`,
        );
      } catch (error) {
        throw new GraphStoreError(
          `Failed to ensure schema: ${error instanceof Error ? error.message : String(error)}`,
          "ensureSchema",
          error,
        );
      } finally {
        await session.close();
      }
    },

    async upsertEntities(options: UpsertEntitiesOptions): Promise<void> {
      const { docId, userId, entities } = options;
      if (entities.length === 0) return;

      const session = driver.session();
      try {
        await session.executeWrite(async (tx) => {
          await tx.run("MERGE (d:Document {docId: $docId})", { docId });

          for (const entity of entities) {
            await tx.run(
              `MERGE (e:Entity {type: $type, name: $name, userId: $userId})
               WITH e
               MATCH (d:Document {docId: $docId})
               MERGE (e)-[:MENTIONED_IN]->(d)`,
              { type: entity.type, name: entity.name, userId, docId },
            );
          }

          // RELATED_TO between co-occurring entities
          if (entities.length > 1) {
            await tx.run(
              `MATCH (d:Document {docId: $docId})<-[:MENTIONED_IN]-(e:Entity {userId: $userId})
               WITH d, collect(e) AS ents
               UNWIND range(0, size(ents) - 2) AS i
               UNWIND range(i + 1, size(ents) - 1) AS j
               WITH ents[i] AS a, ents[j] AS b
               MERGE (a)-[:RELATED_TO]-(b)`,
              { docId, userId },
            );
          }
        });
      } catch (error) {
        if (error instanceof GraphStoreError) throw error;
        throw new GraphStoreError(
          `Upsert failed: ${error instanceof Error ? error.message : String(error)}`,
          "upsertEntities",
          error,
        );
      } finally {
        await session.close();
      }
    },

    async findRelatedDocuments(
      options: FindRelatedDocumentsOptions,
    ): Promise<GraphSearchResult[]> {
      const { docId, userId, depth = 1, limit = 10 } = options;
      const session = driver.session();
      try {
        const visited = new Set<string>([docId]);
        const scores = new Map<string, number>();
        let frontier = [docId];

        for (let hop = 0; hop < depth; hop++) {
          if (frontier.length === 0) break;
          const result = await session.run(
            `MATCH (d:Document)<-[:MENTIONED_IN]-(e:Entity {userId: $userId})
                   -[:MENTIONED_IN]->(other:Document)
             WHERE d.docId IN $frontier AND NOT other.docId IN $visited
             RETURN other.docId AS docId, count(e) AS sharedEntityCount`,
            { userId, frontier, visited: [...visited] },
          );
          const nextFrontier: string[] = [];
          for (const r of result.records) {
            const id = r.get("docId") as string;
            const count = (r.get("sharedEntityCount") as Integer).toNumber();
            scores.set(id, (scores.get(id) ?? 0) + count);
            visited.add(id);
            nextFrontier.push(id);
          }
          frontier = nextFrontier;
        }

        return [...scores.entries()]
          .map(([id, count]) => ({ docId: id, sharedEntityCount: count }))
          .sort((a, b) => b.sharedEntityCount - a.sharedEntityCount)
          .slice(0, limit);
      } catch (error) {
        throw new GraphStoreError(
          `findRelatedDocuments failed: ${error instanceof Error ? error.message : String(error)}`,
          "findRelatedDocuments",
          error,
        );
      } finally {
        await session.close();
      }
    },

    async findDocumentsByEntities(
      options: FindDocumentsByEntitiesOptions,
    ): Promise<GraphSearchResult[]> {
      const { entityNames, userId, limit = 10 } = options;
      if (entityNames.length === 0) return [];

      const session = driver.session();
      try {
        const result = await session.run(
          `MATCH (e:Entity {userId: $userId})-[:MENTIONED_IN]->(d:Document)
           WHERE e.name IN $entityNames
           RETURN d.docId AS docId, count(e) AS sharedEntityCount
           ORDER BY sharedEntityCount DESC
           LIMIT $limit`,
          { userId, entityNames, limit: neo4j.int(limit) },
        );
        return result.records.map((r) => ({
          docId: r.get("docId") as string,
          sharedEntityCount: (r.get("sharedEntityCount") as Integer).toNumber(),
        }));
      } catch (error) {
        throw new GraphStoreError(
          `findDocumentsByEntities failed: ${error instanceof Error ? error.message : String(error)}`,
          "findDocumentsByEntities",
          error,
        );
      } finally {
        await session.close();
      }
    },

    async listEntities(options: ListEntitiesOptions): Promise<GraphEntity[]> {
      const { userId, type, limit = 50, offset = 0 } = options;
      const session = driver.session();
      try {
        const typeFilter = type ? "AND e.type = $type" : "";
        const result = await session.run(
          `MATCH (e:Entity {userId: $userId})
           WHERE true ${typeFilter}
           RETURN e.type AS type, e.name AS name
           ORDER BY e.name
           SKIP $offset
           LIMIT $limit`,
          { userId, type, offset: neo4j.int(offset), limit: neo4j.int(limit) },
        );
        return result.records.map((r) => ({
          type: r.get("type") as GraphEntity["type"],
          name: r.get("name") as string,
        }));
      } catch (error) {
        throw new GraphStoreError(
          `listEntities failed: ${error instanceof Error ? error.message : String(error)}`,
          "listEntities",
          error,
        );
      } finally {
        await session.close();
      }
    },

    async mergeEntities(options: MergeEntitiesOptions): Promise<void> {
      const { userId, targetName, sourceNames, type } = options;
      if (sourceNames.length === 0) return;

      const session = driver.session();
      try {
        await session.executeWrite(async (tx) => {
          await tx.run(
            `MERGE (target:Entity {type: $type, name: $targetName, userId: $userId})
             WITH target
             MATCH (source:Entity {type: $type, userId: $userId})
             WHERE source.name IN $sourceNames AND source <> target
             MATCH (source)-[r:MENTIONED_IN]->(d:Document)
             MERGE (target)-[:MENTIONED_IN]->(d)
             DELETE r`,
            { type, targetName, sourceNames, userId },
          );
          await tx.run(
            `MATCH (source:Entity {type: $type, userId: $userId})
             WHERE source.name IN $sourceNames
             MATCH (source)-[r:RELATED_TO]-(other:Entity)
             WHERE other.name <> $targetName
             MERGE (target:Entity {type: $type, name: $targetName, userId: $userId})
             MERGE (target)-[:RELATED_TO]-(other)
             DELETE r`,
            { type, targetName, sourceNames, userId },
          );
          await tx.run(
            `MATCH (source:Entity {type: $type, userId: $userId})
             WHERE source.name IN $sourceNames
             DETACH DELETE source`,
            { type, sourceNames, userId },
          );
        });
      } catch (error) {
        throw new GraphStoreError(
          `mergeEntities failed: ${error instanceof Error ? error.message : String(error)}`,
          "mergeEntities",
          error,
        );
      } finally {
        await session.close();
      }
    },

    async deleteByDocument(docId: string): Promise<void> {
      const session = driver.session();
      try {
        await session.executeWrite(async (tx) => {
          await tx.run(
            `MATCH (d:Document {docId: $docId})<-[:MENTIONED_IN]-(e:Entity)
             WITH d, collect(e) AS candidates
             DETACH DELETE d
             WITH candidates
             UNWIND candidates AS e
             WHERE NOT (e)-[:MENTIONED_IN]->()
             DETACH DELETE e`,
            { docId },
          );
        });
      } catch (error) {
        throw new GraphStoreError(
          `deleteByDocument failed: ${error instanceof Error ? error.message : String(error)}`,
          "deleteByDocument",
          error,
        );
      } finally {
        await session.close();
      }
    },

    async close(): Promise<void> {
      await driver.close();
    },
  };
}

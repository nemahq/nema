import neo4j, { type Driver, type Integer, isInt } from "neo4j-driver";
import * as Sentry from "@sentry/node";

import { getEnv } from "@server/env";

import type {
  EntityTypeCount,
  FindDocumentsByEntitiesOptions,
  FindDocumentsByEntityOptions,
  FindRelatedDocumentsOptions,
  GetGraphOptions,
  GetRelatedEntitiesOptions,
  GraphData,
  GraphEntity,
  GraphEntityWithCount,
  GraphSearchResult,
  GraphStore,
  ListEntitiesOptions,
  ListEntitiesWithStatsOptions,
  MergeEntitiesOptions,
  UpsertEntitiesOptions,
} from "./graph-store";
import { ENTITY_TYPES, GraphStoreError } from "./graph-store";

function getString(record: { get(key: string): unknown }, key: string): string {
  const field = record.get(key);
  if (typeof field !== "string") {
    throw new GraphStoreError(
      `Expected string for "${key}", got ${typeof field}`,
      "recordParse",
    );
  }
  return field;
}

function getInteger(
  record: { get(key: string): unknown },
  key: string,
): number {
  const field = record.get(key);
  if (!isInt(field)) {
    throw new GraphStoreError(
      `Expected Integer for "${key}", got ${typeof field}`,
      "recordParse",
    );
  }
  return (field as Integer).toNumber();
}

function getOptionalString(
  record: { get(key: string): unknown },
  key: string,
): string | undefined {
  const field = record.get(key);
  if (field === null || field === undefined) {
    return undefined;
  }
  if (typeof field !== "string") {
    throw new GraphStoreError(
      `Expected string or null for "${key}", got ${typeof field}`,
      "recordParse",
    );
  }
  return field;
}

function getEntityType(
  record: { get(key: string): unknown },
  key: string,
): GraphEntity["type"] {
  const raw = getString(record, key);
  if (!(ENTITY_TYPES as readonly string[]).includes(raw)) {
    throw new GraphStoreError(
      `Expected EntityType for "${key}", got "${raw}"`,
      "recordParse",
    );
  }
  return raw as GraphEntity["type"];
}

export function createNeo4jStore(): GraphStore & { close(): Promise<void> } {
  const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE } =
    getEnv();
  const driver: Driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
  );
  const sessionConfig = { database: NEO4J_DATABASE };

  return {
    async ensureSchema(): Promise<void> {
      const session = driver.session(sessionConfig);
      try {
        await session.run(`DROP CONSTRAINT entity_unique IF EXISTS`);
        await session.run(
          `CREATE CONSTRAINT entity_unique_en IF NOT EXISTS
           FOR (e:Entity) REQUIRE (e.type, e.nameEn, e.userId) IS UNIQUE`,
        );
        await session.run(
          `CREATE INDEX entity_user_id IF NOT EXISTS
           FOR (e:Entity) ON (e.userId)`,
        );
        await session.run(
          `CREATE INDEX document_doc_id IF NOT EXISTS
           FOR (d:Document) ON (d.docId)`,
        );
        // Backfill: 기존 엔티티의 name(영문) → nameEn 복사
        await session.run(
          `MATCH (e:Entity) WHERE e.nameEn IS NULL
           SET e.nameEn = e.name`,
        );
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `Failed to ensure schema: ${error instanceof Error ? error.message : String(error)}`,
          "ensureSchema",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async upsertEntities(options: UpsertEntitiesOptions): Promise<void> {
      const { docId, userId, entities, createdAt } = options;
      if (entities.length === 0) {
        return;
      }
      for (const e of entities) {
        if (!e.nameEn.trim()) {
          throw new GraphStoreError(
            "Entity nameEn must not be blank",
            "upsertEntities",
          );
        }
      }

      const session = driver.session(sessionConfig);
      try {
        await session.executeWrite(async (tx) => {
          await tx.run(
            "MERGE (d:Document {docId: $docId}) SET d.createdAt = $createdAt",
            { docId, createdAt },
          );

          await tx.run(
            `UNWIND $entities AS entity
             MERGE (e:Entity {type: entity.type, nameEn: entity.nameEn, userId: $userId})
             SET e.name = entity.name
             WITH e
             MATCH (d:Document {docId: $docId})
             MERGE (e)-[:MENTIONED_IN]->(d)`,
            {
              entities: entities.map((e) => ({
                type: e.type,
                name: e.name,
                nameEn: e.nameEn,
              })),
              userId,
              docId,
            },
          );

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
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `Upsert failed: ${error instanceof Error ? error.message : String(error)}`,
          "upsertEntities",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async findRelatedDocuments(
      options: FindRelatedDocumentsOptions,
    ): Promise<GraphSearchResult[]> {
      const { docId, userId, depth = 1, limit = 10 } = options;
      const session = driver.session(sessionConfig);
      try {
        const visited = new Set<string>([docId]);
        const scores = new Map<string, number>();
        let frontier = [docId];

        for (let hop = 0; hop < depth; hop++) {
          if (frontier.length === 0) {
            break;
          }
          const result = await session.run(
            `MATCH (d:Document)<-[:MENTIONED_IN]-(e:Entity {userId: $userId})
                   -[:MENTIONED_IN]->(other:Document)
             WHERE d.docId IN $frontier AND NOT other.docId IN $visited
             RETURN other.docId AS docId, count(e) AS sharedEntityCount`,
            { userId, frontier, visited: [...visited] },
          );
          const nextFrontier: string[] = [];
          for (const r of result.records) {
            const id = getString(r, "docId");
            const count = getInteger(r, "sharedEntityCount");
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
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `findRelatedDocuments failed: ${error instanceof Error ? error.message : String(error)}`,
          "findRelatedDocuments",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async findDocumentsByEntities(
      options: FindDocumentsByEntitiesOptions,
    ): Promise<GraphSearchResult[]> {
      const { entityNames, userId, limit = 10 } = options;
      if (entityNames.length === 0) {
        return [];
      }

      const session = driver.session(sessionConfig);
      try {
        const result = await session.run(
          `MATCH (e:Entity {userId: $userId})-[:MENTIONED_IN]->(d:Document)
           WHERE e.nameEn IN $entityNames
           RETURN d.docId AS docId, count(e) AS sharedEntityCount
           ORDER BY sharedEntityCount DESC
           LIMIT $limit`,
          { userId, entityNames, limit: neo4j.int(limit) },
        );
        return result.records.map((r) => ({
          docId: getString(r, "docId"),
          sharedEntityCount: getInteger(r, "sharedEntityCount"),
        }));
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `findDocumentsByEntities failed: ${error instanceof Error ? error.message : String(error)}`,
          "findDocumentsByEntities",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async listEntities(options: ListEntitiesOptions): Promise<GraphEntity[]> {
      const { userId, type, limit = 50, offset = 0 } = options;
      const session = driver.session(sessionConfig);
      try {
        const typeFilter = type ? "AND e.type = $type" : "";
        const result = await session.run(
          `MATCH (e:Entity {userId: $userId})
           WHERE true ${typeFilter}
           RETURN e.type AS type, e.name AS name, e.nameEn AS nameEn
           ORDER BY e.name
           SKIP $offset
           LIMIT $limit`,
          { userId, type, offset: neo4j.int(offset), limit: neo4j.int(limit) },
        );
        return result.records.map((r) => ({
          type: getEntityType(r, "type"),
          name: getString(r, "name"),
          nameEn: getOptionalString(r, "nameEn") ?? getString(r, "name"),
        }));
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `listEntities failed: ${error instanceof Error ? error.message : String(error)}`,
          "listEntities",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async listEntitiesWithStats(
      options: ListEntitiesWithStatsOptions,
    ): Promise<GraphEntityWithCount[]> {
      const { userId, type } = options;
      const session = driver.session(sessionConfig);
      try {
        const typeFilter = type ? "AND e.type = $type" : "";
        const result = await session.run(
          `MATCH (e:Entity {userId: $userId})
           WHERE true ${typeFilter}
           OPTIONAL MATCH (e)-[:MENTIONED_IN]->(d:Document)
           RETURN e.type AS type, e.name AS name, e.nameEn AS nameEn,
                  count(d) AS documentCount, max(d.createdAt) AS lastReferencedAt
           ORDER BY lastReferencedAt DESC, documentCount DESC, e.name`,
          { userId, type },
        );
        return result.records.map((r) => ({
          type: getEntityType(r, "type"),
          name: getString(r, "name"),
          nameEn: getOptionalString(r, "nameEn") ?? getString(r, "name"),
          documentCount: getInteger(r, "documentCount"),
          lastReferencedAt: getOptionalString(r, "lastReferencedAt"),
        }));
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `listEntitiesWithStats failed: ${error instanceof Error ? error.message : String(error)}`,
          "listEntitiesWithStats",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async findDocumentsByEntity(
      options: FindDocumentsByEntityOptions,
    ): Promise<string[]> {
      const { userId, name, type, limit = 50 } = options;
      const session = driver.session(sessionConfig);
      try {
        const result = await session.run(
          `MATCH (e:Entity {userId: $userId, nameEn: $name, type: $type})
                 -[:MENTIONED_IN]->(d:Document)
           RETURN d.docId AS docId
           LIMIT $limit`,
          { userId, name, type, limit: neo4j.int(limit) },
        );
        return result.records.map((r) => getString(r, "docId"));
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `findDocumentsByEntity failed: ${error instanceof Error ? error.message : String(error)}`,
          "findDocumentsByEntity",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async getRelatedEntities(
      options: GetRelatedEntitiesOptions,
    ): Promise<GraphEntityWithCount[]> {
      const { userId, name, type, limit = 50 } = options;
      const session = driver.session(sessionConfig);
      try {
        const result = await session.run(
          `MATCH (e:Entity {userId: $userId, nameEn: $name, type: $type})
                 -[:RELATED_TO]-(other:Entity {userId: $userId})
           OPTIONAL MATCH (other)-[:MENTIONED_IN]->(d:Document)
           RETURN other.type AS type, other.name AS name, other.nameEn AS nameEn, count(d) AS documentCount
           ORDER BY documentCount DESC, other.name
           LIMIT $limit`,
          { userId, name, type, limit: neo4j.int(limit) },
        );
        return result.records.map((r) => ({
          type: getEntityType(r, "type"),
          name: getString(r, "name"),
          nameEn: getOptionalString(r, "nameEn") ?? getString(r, "name"),
          documentCount: getInteger(r, "documentCount"),
        }));
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `getRelatedEntities failed: ${error instanceof Error ? error.message : String(error)}`,
          "getRelatedEntities",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async getEntityCountsByType(userId: string): Promise<EntityTypeCount[]> {
      const session = driver.session(sessionConfig);
      try {
        const result = await session.run(
          `MATCH (e:Entity {userId: $userId})
           RETURN e.type AS type, count(e) AS count
           ORDER BY count DESC`,
          { userId },
        );
        return result.records.map((r) => ({
          type: getEntityType(r, "type"),
          count: getInteger(r, "count"),
        }));
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `getEntityCountsByType failed: ${error instanceof Error ? error.message : String(error)}`,
          "getEntityCountsByType",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async mergeEntities(options: MergeEntitiesOptions): Promise<void> {
      const { userId, targetName, sourceNames, type } = options;
      if (sourceNames.length === 0) {
        return;
      }

      const session = driver.session(sessionConfig);
      try {
        await session.executeWrite(async (tx) => {
          await tx.run(
            `MERGE (target:Entity {type: $type, nameEn: $targetName, userId: $userId})
             WITH target
             MATCH (source:Entity {type: $type, userId: $userId})
             WHERE source.nameEn IN $sourceNames AND source <> target
             MATCH (source)-[r:MENTIONED_IN]->(d:Document)
             MERGE (target)-[:MENTIONED_IN]->(d)
             DELETE r`,
            { type, targetName, sourceNames, userId },
          );
          await tx.run(
            `MATCH (source:Entity {type: $type, userId: $userId})
             WHERE source.nameEn IN $sourceNames
             MATCH (source)-[r:RELATED_TO]-(other:Entity)
             WHERE other.nameEn <> $targetName
             MERGE (target:Entity {type: $type, nameEn: $targetName, userId: $userId})
             MERGE (target)-[:RELATED_TO]-(other)
             DELETE r`,
            { type, targetName, sourceNames, userId },
          );
          await tx.run(
            `MATCH (source:Entity {type: $type, userId: $userId})
             WHERE source.nameEn IN $sourceNames
             DETACH DELETE source`,
            { type, sourceNames, userId },
          );
        });
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `mergeEntities failed: ${error instanceof Error ? error.message : String(error)}`,
          "mergeEntities",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async deleteByDocument(docId: string): Promise<void> {
      const session = driver.session(sessionConfig);
      try {
        await session.executeWrite(async (tx) => {
          // Collect candidate orphan entities before deleting document
          const result = await tx.run(
            `MATCH (d:Document {docId: $docId})<-[:MENTIONED_IN]-(e:Entity)
             RETURN collect(id(e)) AS candidateIds`,
            { docId },
          );
          const raw = result.records[0]?.get("candidateIds");
          if (raw != null && !Array.isArray(raw)) {
            Sentry.captureMessage(
              `[neo4j] Expected array for "candidateIds", got ${typeof raw}`,
              { level: "warning", extra: { docId } },
            );
          }
          const candidateIds = Array.isArray(raw) ? raw : [];

          // Delete the document and its relationships
          await tx.run(`MATCH (d:Document {docId: $docId}) DETACH DELETE d`, {
            docId,
          });

          // Delete orphan entities (no remaining MENTIONED_IN)
          if (candidateIds.length > 0) {
            await tx.run(
              `MATCH (e:Entity)
               WHERE id(e) IN $ids AND NOT (e)-[:MENTIONED_IN]->()
               DETACH DELETE e`,
              { ids: candidateIds },
            );
          }
        });
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `deleteByDocument failed: ${error instanceof Error ? error.message : String(error)}`,
          "deleteByDocument",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async getGraph(options: GetGraphOptions): Promise<GraphData> {
      const { userId } = options;
      const session = driver.session(sessionConfig);
      try {
        const entityResult = await session.run(
          `MATCH (e:Entity {userId: $userId})
           OPTIONAL MATCH (e)-[:MENTIONED_IN]->(d:Document)
           RETURN e.type AS type, e.name AS name, e.nameEn AS nameEn,
                  count(d) AS documentCount, max(d.createdAt) AS lastReferencedAt
           ORDER BY documentCount DESC, e.name`,
          { userId },
        );
        const edgeResult = await session.run(
          `MATCH (a:Entity {userId: $userId})-[:RELATED_TO]-(b:Entity {userId: $userId})
           WHERE id(a) < id(b)
           RETURN a.type AS sourceType, a.name AS sourceName,
                  b.type AS targetType, b.name AS targetName`,
          { userId },
        );

        return {
          entities: entityResult.records.map((r) => ({
            type: getEntityType(r, "type"),
            name: getString(r, "name"),
            nameEn: getOptionalString(r, "nameEn") ?? getString(r, "name"),
            documentCount: getInteger(r, "documentCount"),
            lastReferencedAt: getOptionalString(r, "lastReferencedAt"),
          })),
          edges: edgeResult.records.map((r) => ({
            sourceType: getEntityType(r, "sourceType"),
            sourceName: getString(r, "sourceName"),
            targetType: getEntityType(r, "targetType"),
            targetName: getString(r, "targetName"),
          })),
        };
      } catch (error) {
        if (error instanceof GraphStoreError) {
          throw error;
        }
        throw new GraphStoreError(
          `getGraph failed: ${error instanceof Error ? error.message : String(error)}`,
          "getGraph",
          error,
        );
      } finally {
        try {
          await session.close();
        } catch (closeErr) {
          Sentry.captureMessage("[neo4j] session.close() failed", {
            level: "warning",
            extra: { closeError: closeErr },
          });
        }
      }
    },

    async close(): Promise<void> {
      await driver.close();
    },
  };
}

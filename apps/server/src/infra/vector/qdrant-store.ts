import { getEnv } from "@server/env";
import {
  type EmbeddingProvider,
  VECTOR_DIMENSION,
} from "@server/infra/embedding";

import type { QdrantClient } from "./qdrant-client";
import type {
  NeighborSearchOptions,
  SearchOptions,
  StatementPayload,
  StatementSearchHit,
  StatementUpsertItem,
  VectorStore,
} from "./vector-store";
import { VectorStoreError } from "./vector-store";

export function createQdrantStore(client: QdrantClient): VectorStore {
  const { QDRANT_COLLECTION } = getEnv();

  async function ensurePayloadIndexes(): Promise<void> {
    // 검색 격리 필터는 space_id 하나 (schema-design 5.3).
    // statement_id는 point id라 별도 인덱스 불요.
    await client.createPayloadIndex(QDRANT_COLLECTION, {
      field_name: "space_id",
      field_schema: "keyword",
    });
  }

  return {
    async ensureCollection(): Promise<void> {
      try {
        const { exists } = await client.collectionExists(QDRANT_COLLECTION);
        if (!exists) {
          try {
            await client.createCollection(QDRANT_COLLECTION, {
              vectors: { size: VECTOR_DIMENSION, distance: "Cosine" },
              quantization_config: {
                scalar: { type: "int8", always_ram: true },
              },
            });
          } catch (createError) {
            // 다른 인스턴스가 동시에 컬렉션을 생성했을 수 있으므로 재확인
            const { exists: recheck } =
              await client.collectionExists(QDRANT_COLLECTION);
            if (!recheck) {
              throw new VectorStoreError(
                `Failed to create collection: ${createError instanceof Error ? createError.message : String(createError)}`,
                "ensureCollection",
                createError,
              );
            }
          }
          await ensurePayloadIndexes();
        }
      } catch (error) {
        if (error instanceof VectorStoreError) {
          throw error;
        }
        throw new VectorStoreError(
          `Failed to ensure collection: ${error instanceof Error ? error.message : String(error)}`,
          "ensureCollection",
          error,
        );
      }
    },

    async upsertStatements(
      provider: EmbeddingProvider,
      statements: StatementUpsertItem[],
    ): Promise<void> {
      if (statements.length === 0) {
        return;
      }

      if (provider.dimension !== VECTOR_DIMENSION) {
        throw new VectorStoreError(
          `Provider dimension ${provider.dimension} does not match collection vector size ${VECTOR_DIMENSION}`,
          "upsertStatements",
        );
      }

      try {
        const result = await provider.embed(
          statements.map((s) => s.content),
          "document",
        );

        if (result.embeddings.length !== statements.length) {
          throw new VectorStoreError(
            `Embedding count mismatch: expected ${statements.length}, got ${result.embeddings.length}`,
            "upsertStatements",
          );
        }

        const points = statements.map((statement, index) => {
          const payload: StatementPayload = {
            statement_id: statement.statementId,
            space_id: statement.spaceId,
            content: statement.content,
            type: statement.type,
            confidence: statement.confidence,
            created_at: statement.createdAt,
            embedding_model: `${provider.providerId}/${provider.model}`,
          };
          return {
            id: statement.statementId,
            vector: result.embeddings[index],
            payload: payload as unknown as Record<string, unknown>,
          };
        });

        await client.upsert(QDRANT_COLLECTION, { wait: true, points });
      } catch (error) {
        if (error instanceof VectorStoreError) {
          throw error;
        }
        throw new VectorStoreError(
          `Upsert failed: ${error instanceof Error ? error.message : String(error)}`,
          "upsertStatements",
          error,
        );
      }
    },

    async search(
      provider: EmbeddingProvider,
      options: SearchOptions,
    ): Promise<StatementSearchHit[]> {
      const { spaceIds, query, limit, scoreThreshold } = options;

      if (provider.dimension !== VECTOR_DIMENSION) {
        throw new VectorStoreError(
          `Provider dimension ${provider.dimension} does not match collection vector size ${VECTOR_DIMENSION}`,
          "search",
        );
      }

      if (spaceIds.length === 0) {
        return [];
      }

      try {
        const result = await provider.embed([query], "query");
        const vector = result.embeddings[0];

        if (!vector) {
          throw new VectorStoreError(
            "Embedding provider returned no vector for search query",
            "search",
          );
        }

        const searchResult = await client.search(QDRANT_COLLECTION, {
          vector,
          limit,
          filter: {
            must: [{ key: "space_id", match: { any: spaceIds } }],
          },
          // point id = statement_id 계약
          with_payload: false,
          score_threshold: scoreThreshold,
        });

        return searchResult.map((point) => ({
          statementId: String(point.id),
          score: point.score,
        }));
      } catch (error) {
        if (error instanceof VectorStoreError) {
          throw error;
        }
        throw new VectorStoreError(
          `Search failed: ${error instanceof Error ? error.message : String(error)}`,
          "search",
          error,
        );
      }
    },

    async searchNeighbors(
      options: NeighborSearchOptions,
    ): Promise<StatementSearchHit[]> {
      const { statementId, spaceId, limit, scoreThreshold } = options;

      try {
        // query = point id → 저장된 벡터로 최근접 검색. 앵커 자신은 has_id로 제외.
        const result = await client.query(QDRANT_COLLECTION, {
          query: statementId,
          limit,
          filter: {
            must: [{ key: "space_id", match: { any: [spaceId] } }],
            must_not: [{ has_id: [statementId] }],
          },
          with_payload: false,
          score_threshold: scoreThreshold,
        });

        return result.points.map((point) => ({
          statementId: String(point.id),
          score: point.score,
        }));
      } catch (error) {
        throw new VectorStoreError(
          `Neighbor search failed: ${error instanceof Error ? error.message : String(error)}`,
          "searchNeighbors",
          error,
        );
      }
    },

    async deleteStatements(statementIds: string[]): Promise<void> {
      if (statementIds.length === 0) {
        return;
      }
      try {
        await client.delete(QDRANT_COLLECTION, {
          wait: true,
          points: statementIds,
        });
      } catch (error) {
        throw new VectorStoreError(
          `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          "deleteStatements",
          error,
        );
      }
    },
  };
}

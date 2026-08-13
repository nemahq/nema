import {
  type EmbeddingProvider,
  VECTOR_DIMENSION,
} from "@server/infra/embedding";

import type { QdrantClient } from "./qdrant-client";
import type {
  DigestPayload,
  DigestSearchHit,
  DigestUpsertItem,
  SearchOptions,
  VectorStore,
} from "./vector-store";
import { VectorStoreError } from "./vector-store";

export function createQdrantStore(
  client: QdrantClient,
  collectionName: string,
): VectorStore {
  async function ensurePayloadIndexes(): Promise<void> {
    // 검색 격리 필터는 user_id 하나 — 다이제스트가 자기 소유자만 볼 수 있어야 한다
    // (digests 테이블의 owner-only RLS와 같은 경계). digest_id는 point id라 별도
    // 인덱스 불요. createPayloadIndex는 이미 있는 인덱스에 다시 걸어도 안전해서
    // (idempotent, 확인됨) 컬렉션이 이미 있던 경우에도 매번 건다 — 콘솔에서
    // 미리 만든 컬렉션은 이 앱이 인덱스를 건 적이 없을 수 있어서다.
    await client.createPayloadIndex(collectionName, {
      field_name: "user_id",
      field_schema: "keyword",
    });
  }

  return {
    async ensureCollection(): Promise<void> {
      try {
        const { exists } = await client.collectionExists(collectionName);
        if (!exists) {
          try {
            await client.createCollection(collectionName, {
              vectors: { size: VECTOR_DIMENSION, distance: "Cosine" },
              quantization_config: {
                scalar: { type: "int8", always_ram: true },
              },
            });
          } catch (createError) {
            // 다른 인스턴스가 동시에 컬렉션을 생성했을 수 있으므로 재확인
            const { exists: recheck } =
              await client.collectionExists(collectionName);
            if (!recheck) {
              throw new VectorStoreError(
                `Failed to create collection: ${createError instanceof Error ? createError.message : String(createError)}`,
                "ensureCollection",
                createError,
              );
            }
          }
        }
        await ensurePayloadIndexes();
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

    async upsertDigests(
      provider: EmbeddingProvider,
      items: DigestUpsertItem[],
    ): Promise<void> {
      if (items.length === 0) {
        return;
      }

      if (provider.dimension !== VECTOR_DIMENSION) {
        throw new VectorStoreError(
          `Provider dimension ${provider.dimension} does not match collection vector size ${VECTOR_DIMENSION}`,
          "upsertDigests",
        );
      }

      try {
        const result = await provider.embed(
          items.map((item) => item.text),
          "document",
        );

        if (result.embeddings.length !== items.length) {
          throw new VectorStoreError(
            `Embedding count mismatch: expected ${items.length}, got ${result.embeddings.length}`,
            "upsertDigests",
          );
        }

        const points = items.map((item, index) => {
          const payload: DigestPayload = {
            digest_id: item.digestId,
            user_id: item.userId,
            created_at: item.createdAt,
            embedding_model: `${provider.providerId}/${provider.model}`,
          };
          return {
            id: item.digestId,
            vector: result.embeddings[index],
            payload,
          };
        });

        await client.upsert(collectionName, { wait: true, points });
      } catch (error) {
        if (error instanceof VectorStoreError) {
          throw error;
        }
        throw new VectorStoreError(
          `Upsert failed: ${error instanceof Error ? error.message : String(error)}`,
          "upsertDigests",
          error,
        );
      }
    },

    async search(
      provider: EmbeddingProvider,
      options: SearchOptions,
    ): Promise<DigestSearchHit[]> {
      const { userId, query, limit } = options;

      if (provider.dimension !== VECTOR_DIMENSION) {
        throw new VectorStoreError(
          `Provider dimension ${provider.dimension} does not match collection vector size ${VECTOR_DIMENSION}`,
          "search",
        );
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

        // 구 search() 엔드포인트가 폐기돼(js-client-rest 1.19) query()로 대체됐다 —
        // query에 벡터값을 그대로 넘기면 같은 최근접 검색으로 동작한다.
        const queryResult = await client.query(collectionName, {
          query: vector,
          limit,
          filter: { must: [{ key: "user_id", match: { value: userId } }] },
          // point id = digest_id 계약
          with_payload: false,
        });

        return queryResult.points.map((point) => ({
          digestId: String(point.id),
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

    async deleteDigests(digestIds: string[]): Promise<void> {
      if (digestIds.length === 0) {
        return;
      }
      try {
        await client.delete(collectionName, {
          wait: true,
          points: digestIds,
        });
      } catch (error) {
        throw new VectorStoreError(
          `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          "deleteDigests",
          error,
        );
      }
    },
  };
}

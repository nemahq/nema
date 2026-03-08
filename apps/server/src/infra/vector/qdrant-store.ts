import { QdrantClient } from "@qdrant/js-client-rest";

import { getEnv } from "@server/env";
import {
  type EmbeddingProvider,
  VECTOR_DIMENSION,
} from "@server/infra/embedding";

import type {
  DocumentPayload,
  SearchOptions,
  UpsertOptions,
  VectorSearchResult,
  VectorStore,
} from "./vector-store";
import { VectorStoreError } from "./vector-store";

const COLLECTION_NAME = "documents";

export function createQdrantStore(): VectorStore {
  const { QDRANT_URL, QDRANT_API_KEY } = getEnv();
  const client = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
  });

  async function ensurePayloadIndexes(): Promise<void> {
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "user_id",
      field_schema: "keyword",
    });
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "doc_id",
      field_schema: "keyword",
    });
  }

  return {
    async ensureCollection(): Promise<void> {
      try {
        const { exists } = await client.collectionExists(COLLECTION_NAME);
        if (!exists) {
          try {
            await client.createCollection(COLLECTION_NAME, {
              vectors: { size: VECTOR_DIMENSION, distance: "Cosine" },
            });
          } catch (createError) {
            // 다른 인스턴스가 동시에 컬렉션을 생성했을 수 있으므로 재확인
            const { exists: recheck } =
              await client.collectionExists(COLLECTION_NAME);
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
        if (error instanceof VectorStoreError) throw error;
        throw new VectorStoreError(
          `Failed to ensure collection: ${error instanceof Error ? error.message : String(error)}`,
          "ensureCollection",
          error,
        );
      }
    },

    async upsert(
      provider: EmbeddingProvider,
      options: UpsertOptions,
    ): Promise<string[]> {
      const { docId, userId, chunks, tags, summary } = options;

      if (chunks.length === 0) return [];

      if (provider.dimension !== VECTOR_DIMENSION) {
        throw new VectorStoreError(
          `Provider dimension ${provider.dimension} does not match collection vector size ${VECTOR_DIMENSION}`,
          "upsert",
        );
      }

      try {
        const result = await provider.embed(chunks, "document");

        if (result.embeddings.length !== chunks.length) {
          throw new VectorStoreError(
            `Embedding count mismatch: expected ${chunks.length}, got ${result.embeddings.length}`,
            "upsert",
          );
        }

        const now = new Date().toISOString();
        const ids: string[] = [];

        const points = result.embeddings.map((vector, index) => {
          const id = crypto.randomUUID();
          ids.push(id);
          const payload: DocumentPayload = {
            doc_id: docId,
            user_id: userId,
            chunk_index: index,
            text: chunks[index],
            tags,
            summary,
            embedding_model: `${provider.providerId}/${provider.model}`,
            created_at: now,
          };
          return {
            id,
            vector,
            payload: payload as unknown as Record<string, unknown>,
          };
        });

        await client.upsert(COLLECTION_NAME, {
          wait: true,
          points,
        });

        return ids;
      } catch (error) {
        if (error instanceof VectorStoreError) throw error;
        throw new VectorStoreError(
          `Upsert failed: ${error instanceof Error ? error.message : String(error)}`,
          "upsert",
          error,
        );
      }
    },

    async search(
      provider: EmbeddingProvider,
      options: SearchOptions,
    ): Promise<VectorSearchResult[]> {
      const { userId, query, limit = 10, scoreThreshold } = options;

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

        const must: Record<string, unknown>[] = [
          { key: "user_id", match: { value: userId } },
        ];

        const searchResult = await client.search(COLLECTION_NAME, {
          vector,
          limit,
          filter: { must },
          with_payload: true,
          score_threshold: scoreThreshold,
        });

        return searchResult.map((point) => ({
          id: String(point.id),
          score: point.score,
          payload: point.payload as unknown as DocumentPayload,
        }));
      } catch (error) {
        if (error instanceof VectorStoreError) throw error;
        throw new VectorStoreError(
          `Search failed: ${error instanceof Error ? error.message : String(error)}`,
          "search",
          error,
        );
      }
    },

    async deleteByDocument(docId: string): Promise<void> {
      try {
        await client.delete(COLLECTION_NAME, {
          wait: true,
          filter: {
            must: [{ key: "doc_id", match: { value: docId } }],
          },
        });
      } catch (error) {
        throw new VectorStoreError(
          `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          "deleteByDocument",
          error,
        );
      }
    },
  };
}

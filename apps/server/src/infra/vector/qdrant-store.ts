import { QdrantClient } from "@qdrant/js-client-rest";
import { requireEnv } from "../../env.js";
import type { EmbeddingProvider } from "../embedding/index.js";
import type {
  VectorStore,
  UpsertOptions,
  SearchOptions,
  VectorSearchResult,
  DocumentPayload,
} from "./vector-store.js";
import { VectorStoreError } from "./vector-store.js";

const COLLECTION_NAME = "documents";
const VECTOR_SIZE = 1024;

export function createQdrantStore(): VectorStore {
  const client = new QdrantClient({
    url: requireEnv("QDRANT_URL"),
    apiKey: requireEnv("QDRANT_API_KEY"),
  });

  return {
    async ensureCollection(): Promise<void> {
      try {
        const { exists } = await client.collectionExists(COLLECTION_NAME);
        if (exists) return;

        await client.createCollection(COLLECTION_NAME, {
          vectors: { size: VECTOR_SIZE, distance: "Cosine" },
        });

        await client.createPayloadIndex(COLLECTION_NAME, {
          field_name: "user_id",
          field_schema: "keyword",
        });
      } catch (error) {
        // Tolerate race condition: another instance may have created it
        const { exists: recheck } =
          await client.collectionExists(COLLECTION_NAME);
        if (!recheck) {
          throw new VectorStoreError(
            `Failed to ensure collection: ${error instanceof Error ? error.message : String(error)}`,
            "ensureCollection",
            error,
          );
        }
      }
    },

    async upsert(
      provider: EmbeddingProvider,
      options: UpsertOptions,
    ): Promise<string[]> {
      const { docId, userId, chunks, tags, summary } = options;

      if (chunks.length === 0) return [];

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
          // Qdrant expects Record<string, unknown> for payload
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
          // Qdrant returns Record<string, unknown>; we control the payload
          // schema via upsert, so the cast is safe within this module.
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
  };
}

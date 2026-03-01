import { QdrantClient } from "@qdrant/js-client-rest";
import { requireEnv } from "../env.js";
import type { EmbeddingProvider } from "../embedding/index.js";

const COLLECTION_NAME = "documents";
const VECTOR_SIZE = 1024;

export class VectorStoreError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VectorStoreError";
  }
}

export interface DocumentPayload {
  user_id: string;
  context_id: string;
  chunk_index: number;
  text: string;
  embedding_model: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: DocumentPayload;
}

export interface UpsertOptions {
  userId: string;
  contextId: string;
  chunks: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  userId: string;
  query: string;
  limit?: number;
  contextId?: string;
  scoreThreshold?: number;
}

export interface VectorStore {
  ensureCollection(): Promise<void>;
  upsert(
    provider: EmbeddingProvider,
    options: UpsertOptions,
  ): Promise<string[]>;
  search(
    provider: EmbeddingProvider,
    options: SearchOptions,
  ): Promise<VectorSearchResult[]>;
}

export function createVectorStore(): VectorStore {
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
      const { userId, contextId, chunks, metadata } = options;

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
            user_id: userId,
            context_id: contextId,
            chunk_index: index,
            text: chunks[index],
            embedding_model: `${provider.providerId}/${provider.model}`,
            created_at: now,
            metadata,
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
      const { userId, query, limit = 10, contextId, scoreThreshold } = options;

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
        if (contextId) {
          must.push({ key: "context_id", match: { value: contextId } });
        }

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

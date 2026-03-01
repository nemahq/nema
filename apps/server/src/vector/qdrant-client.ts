import { QdrantClient } from "@qdrant/js-client-rest";
import { requireEnv } from "../env.js";
import type { EmbeddingProvider } from "../embedding/index.js";

const COLLECTION_NAME = "documents";
const VECTOR_SIZE = 1024;

export interface DocumentPayload {
  user_id: string;
  context_id: string;
  chunk_index: number;
  text: string;
  embedding_model: string;
  created_at: string;
  [key: string]: unknown;
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
      const { exists } = await client.collectionExists(COLLECTION_NAME);
      if (exists) return;

      await client.createCollection(COLLECTION_NAME, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      });

      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "user_id",
        field_schema: "keyword",
      });
    },

    async upsert(
      provider: EmbeddingProvider,
      options: UpsertOptions,
    ): Promise<string[]> {
      const { userId, contextId, chunks, metadata = {} } = options;

      if (chunks.length === 0) return [];

      const result = await provider.embed(chunks, "document");
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
          ...metadata,
        };
        return { id, vector, payload };
      });

      await client.upsert(COLLECTION_NAME, {
        wait: true,
        points,
      });

      return ids;
    },

    async search(
      provider: EmbeddingProvider,
      options: SearchOptions,
    ): Promise<VectorSearchResult[]> {
      const { userId, query, limit = 10, contextId, scoreThreshold } = options;

      const result = await provider.embed([query], "query");
      const vector = result.embeddings[0];

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
        payload: point.payload as unknown as DocumentPayload,
      }));
    },
  };
}

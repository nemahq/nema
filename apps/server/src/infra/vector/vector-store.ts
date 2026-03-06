import type { EmbeddingProvider } from "../embedding/index.js";

export class VectorStoreError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "VectorStoreError";
  }
}

export interface DocumentPayload {
  doc_id: string;
  user_id: string;
  chunk_index: number;
  text: string;
  tags: string[];
  summary: string;
  embedding_model: string;
  created_at: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: DocumentPayload;
}

export interface UpsertOptions {
  docId: string;
  userId: string;
  chunks: string[];
  tags: string[];
  summary: string;
}

export interface SearchOptions {
  userId: string;
  query: string;
  limit?: number;
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
  deleteByDocument(docId: string): Promise<void>;
}

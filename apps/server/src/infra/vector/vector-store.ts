import type { EmbeddingProvider } from "@server/infra/embedding";

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

// 1다이제스트 = 1 point. point id = digest_id — Postgres 원장이 본문의 원천이라
// 페이로드엔 검색 격리·식별에 쓰는 값만 담는다(본문은 안 싣는다).
export interface DigestPayload {
  digest_id: string;
  user_id: string;
  created_at: string;
  embedding_model: string;
}

export interface DigestUpsertItem {
  digestId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface DigestSearchHit {
  digestId: string;
  score: number;
}

export interface SearchOptions {
  userId: string;
  query: string;
  limit: number;
}

export interface VectorStore {
  ensureCollection(): Promise<void>;
  upsertDigests(
    provider: EmbeddingProvider,
    items: DigestUpsertItem[],
  ): Promise<void>;
  /** 본문은 Postgres 원장에서 다시 읽는다 — 색인은 digest_id+score만 돌려준다. */
  search(
    provider: EmbeddingProvider,
    options: SearchOptions,
  ): Promise<DigestSearchHit[]>;
}

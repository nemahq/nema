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
export type DigestPayload = {
  digest_id: string;
  user_id: string;
  created_at: string;
  embedding_model: string;
};

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

export interface NeighborOptions {
  userId: string;
  /** 이 다이제스트의 벡터를 질의로 쓴다 — point id = digest_id 계약을 그대로 이용한다. */
  digestId: string;
  limit: number;
  minScore: number;
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
  /**
   * 한 다이제스트와 뜻이 가까운 다이제스트들. 관계 후보를 찾는 데 쓴다.
   * 이미 색인된 벡터를 질의로 그대로 재사용하므로 임베딩을 다시 부르지 않는다 —
   * 새로 임베딩하면 비용도 늘고, 색인된 것(document)과 다른 결(query)로 물어보게 된다.
   */
  searchNeighbors(options: NeighborOptions): Promise<DigestSearchHit[]>;
  /** Postgres에서 지워진 digest의 벡터를 없앤다 — 안 부르면 고아 벡터가 검색 결과에
   * 계속 섞인다(재추출·삭제 양쪽 다 해당). */
  deleteDigests(digestIds: string[]): Promise<void>;
}

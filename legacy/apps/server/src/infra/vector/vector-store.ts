import type { Database } from "@server/infra/database.types";
import type { EmbeddingProvider } from "@server/infra/embedding";

type StatementType = Database["public"]["Enums"]["statement_type"];
type StatementConfidence = Database["public"]["Enums"]["statement_confidence"];

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

// 1진술 = 1 point. point id = statement_id (schema-design 5.3)
export interface StatementPayload {
  statement_id: string;
  space_id: string;
  content: string;
  type: StatementType;
  confidence: StatementConfidence | null;
  created_at: string;
  embedding_model: string;
}

export interface StatementUpsertItem {
  statementId: string;
  spaceId: string;
  content: string;
  type: StatementType;
  confidence: StatementConfidence | null;
  createdAt: string;
}

export interface StatementSearchHit {
  statementId: string;
  score: number;
}

export interface SearchOptions {
  spaceIds: string[];
  query: string;
  limit: number;
  scoreThreshold: number;
  // 줄기 범위 좁히기 — 주어지면 이 진술 id 집합 안에서만 검색한다 (narration-design 3장).
  // 빈 배열은 "후보 없음" → 0건. undefined는 한정 없음 → 공간 전체.
  statementIds?: string[];
}

export interface NeighborSearchOptions {
  statementId: string;
  spaceId: string;
  limit: number;
  scoreThreshold: number;
}

export interface VectorStore {
  ensureCollection(): Promise<void>;
  upsertStatements(
    provider: EmbeddingProvider,
    statements: StatementUpsertItem[],
  ): Promise<void>;
  deleteStatements(statementIds: string[]): Promise<void>;
  /** 본문은 Postgres 원장에서 다시 읽는다 — 색인은 statement_id+score만 돌려준다. */
  search(
    provider: EmbeddingProvider,
    options: SearchOptions,
  ): Promise<StatementSearchHit[]>;
  /**
   * 관계 후보 좁히기 ⓐ — 한 진술의 저장된 벡터로 자기 space의 뜻 이웃을 찾는다
   * (relation-design §4). 재임베딩하지 않고(query/document 타입 불일치 회피) point id
   * 최근접을 쓰며, 앵커 자신은 제외한다. 벡터가 없는(임베딩 failed) 진술엔 쓰지 않는다.
   */
  searchNeighbors(
    options: NeighborSearchOptions,
  ): Promise<StatementSearchHit[]>;
}

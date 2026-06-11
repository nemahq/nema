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

export interface VectorStore {
  ensureCollection(): Promise<void>;
  /** 부팅 시 1회 — v1 컬렉션(documents·entities) 정리. 지운 이름을 반환한다. */
  dropLegacyCollections(): Promise<string[]>;
  upsertStatements(
    provider: EmbeddingProvider,
    statements: StatementUpsertItem[],
  ): Promise<void>;
  deleteStatements(statementIds: string[]): Promise<void>;
}

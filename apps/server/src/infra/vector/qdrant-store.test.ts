import { beforeEach, describe, expect, it, vi } from "vitest";

// 활성 컬렉션 가드 검증을 위해 레거시 이름 중 하나(documents)를 현재 컬렉션으로 설정
vi.mock("@server/env", () => ({
  getEnv: () => ({ QDRANT_COLLECTION: "documents" }),
}));

import type { EmbeddingProvider } from "@server/infra/embedding";
import { VECTOR_DIMENSION } from "@server/infra/embedding";

import type { QdrantClient } from "./qdrant-client";
import { createQdrantStore } from "./qdrant-store";
import type { StatementUpsertItem } from "./vector-store";
import { VectorStoreError } from "./vector-store";

function mockClient() {
  return {
    collectionExists: vi.fn().mockResolvedValue({ exists: true }),
    createCollection: vi.fn(),
    createPayloadIndex: vi.fn(),
    deleteCollection: vi.fn().mockResolvedValue(true),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as QdrantClient & {
    collectionExists: ReturnType<typeof vi.fn>;
    deleteCollection: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
}

function mockEmbedding(embeddings: number[][]): EmbeddingProvider {
  return {
    providerId: "test",
    model: "test-model",
    dimension: VECTOR_DIMENSION,
    embed: vi.fn().mockResolvedValue({
      embeddings,
      model: "test-model",
      dimension: VECTOR_DIMENSION,
    }),
  };
}

const STATEMENT: StatementUpsertItem = {
  statementId: "c0000000-0000-4000-a000-000000000001",
  spaceId: "b0000000-0000-4000-a000-000000000001",
  content: "테스트 진술",
  type: "claim",
  confidence: "certain",
  createdAt: "2026-06-11T00:00:00.000Z",
};

describe("createQdrantStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dropLegacyCollections — 현재 설정된 컬렉션과 이름이 겹치면 지우지 않는다", async () => {
    const client = mockClient();
    const store = createQdrantStore(client);

    const dropped = await store.dropLegacyCollections();

    // 현재 컬렉션(documents)은 레거시 목록에 있어도 보호, 나머지만 삭제
    expect(dropped).toEqual(["documents-staging", "entities"]);
    const deletedNames = client.deleteCollection.mock.calls.map(([n]) => n);
    expect(deletedNames).not.toContain("documents");
  });

  it("upsertStatements — 임베딩 개수가 어긋나면 upsert 없이 거부한다", async () => {
    const client = mockClient();
    const store = createQdrantStore(client);
    // 진술 2개에 벡터 1개 — 어긋난 벡터가 엉뚱한 statement_id에 기록되는 손상 방지
    const embedding = mockEmbedding([[0.1, 0.2]]);

    await expect(
      store.upsertStatements(embedding, [
        STATEMENT,
        { ...STATEMENT, statementId: "c0000000-0000-4000-a000-000000000002" },
      ]),
    ).rejects.toThrow(VectorStoreError);

    expect(client.upsert).not.toHaveBeenCalled();
  });
});

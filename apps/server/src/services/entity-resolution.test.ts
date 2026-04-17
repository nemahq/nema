import { describe, expect, it, vi } from "vitest";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { EntityVectorStore } from "@server/infra/vector";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/node";

import { resolveEntities } from "./entity-resolution";

// --- Mock factories ---

function mockGraphStore(): GraphStore {
  return {
    ensureSchema: vi.fn(),
    upsertEntities: vi.fn(),
    findRelatedDocuments: vi.fn(),
    findDocumentsByEntities: vi.fn(),
    listEntities: vi.fn(),
    listEntitiesWithStats: vi.fn(),
    findDocumentsByEntity: vi.fn(),
    getRelatedEntities: vi.fn(),
    getEntityCountsByType: vi.fn(),
    mergeEntities: vi.fn(),
    deleteByDocument: vi.fn(),
    getGraph: vi.fn(),
    findEntitiesByNormalizedNames: vi.fn().mockResolvedValue([]),
  } as unknown as GraphStore;
}

function mockEntityVectorStore(
  searchResults: Array<{ name: string; type: string; score: number }> = [],
): EntityVectorStore {
  return {
    ensureCollection: vi.fn(),
    upsert: vi.fn(),
    search: vi.fn().mockResolvedValue(searchResults),
    deleteByEntities: vi.fn().mockResolvedValue(undefined),
    pruneOrphans: vi.fn().mockResolvedValue(0),
  };
}

function mockEmbedding(): EmbeddingProvider {
  return {
    providerId: "test",
    model: "test-model",
    dimension: 1024,
    embed: vi.fn().mockResolvedValue({
      embeddings: [[0.1]],
      model: "test",
      dimension: 1024,
    }),
  };
}

function mockLlm(
  resolutions: Array<{
    extractedName: string;
    extractedType: string;
    matchedName: string | null;
  }> = [],
): LlmProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({ resolutions }),
    async *generateStream() {
      yield "";
    },
    generateText: vi.fn(),
  };
}

const USER_ID = "test-user";

// --- Tests ---

describe("resolveEntities", () => {
  it("returns empty array for empty input", async () => {
    const result = await resolveEntities({
      extractedEntities: [],
      userId: USER_ID,
      graphStore: mockGraphStore(),
      entityVectorStore: mockEntityVectorStore(),
      embedding: mockEmbedding(),
      llm: mockLlm(),
    });
    expect(result).toEqual([]);
  });

  describe("Stage 1: 정규화 일치", () => {
    it("matches entity by normalized name (case + whitespace)", async () => {
      const graphStore = mockGraphStore();
      (
        graphStore.findEntitiesByNormalizedNames as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { type: "Person", normalizedName: "alice kim", name: "Alice Kim" },
      ]);
      const result = await resolveEntities({
        extractedEntities: [{ type: "Person", name: "  Alice Kim  " }],
        userId: USER_ID,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      expect(result).toEqual([
        expect.objectContaining({ name: "Alice Kim", isNew: false }),
      ]);
    });

    it("does not match different types with same name", async () => {
      const graphStore = mockGraphStore();
      // Topic 타입 쿼리에 대해 빈 결과 반환 — Organization 엔티티는 매칭 안 됨
      (
        graphStore.findEntitiesByNormalizedNames as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);
      const result = await resolveEntities({
        extractedEntities: [{ type: "Topic", name: "Python" }],
        userId: USER_ID,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      expect(result[0].isNew).toBe(true);
    });
  });

  describe("Stage 2: 임베딩 유사도", () => {
    it("passes candidates to Stage 3 LLM when embedding search finds matches", async () => {
      const llm = mockLlm([
        {
          extractedName: "베트남 쌀국수",
          extractedType: "Topic",
          matchedName: "쌀국수",
        },
      ]);
      const result = await resolveEntities({
        extractedEntities: [{ type: "Topic", name: "베트남 쌀국수" }],
        userId: USER_ID,
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore([
          { name: "쌀국수", type: "Topic", score: 0.85 },
        ]),
        embedding: mockEmbedding(),
        llm,
      });
      expect(llm.generateStructured).toHaveBeenCalled();
      expect(result[0]).toEqual(
        expect.objectContaining({ name: "쌀국수", isNew: false }),
      );
    });

    it("marks as new when no embedding candidates found", async () => {
      const llm = mockLlm();
      const result = await resolveEntities({
        extractedEntities: [{ type: "Topic", name: "완전히 새로운 개념" }],
        userId: USER_ID,
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm,
      });
      expect(llm.generateStructured).not.toHaveBeenCalled();
      expect(result[0].isNew).toBe(true);
    });

    it("treats entity as new when embedding search fails", async () => {
      const entityVectorStore = mockEntityVectorStore();
      (entityVectorStore.search as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Qdrant timeout"),
      );
      const result = await resolveEntities({
        extractedEntities: [{ type: "Person", name: "테스트" }],
        userId: USER_ID,
        graphStore: mockGraphStore(),
        entityVectorStore,
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      expect(result[0].isNew).toBe(true);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  describe("Stage 3: LLM 판정", () => {
    it("treats all as new when LLM fails", async () => {
      const llm = mockLlm();
      (llm.generateStructured as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("LLM rate limit"),
      );
      const result = await resolveEntities({
        extractedEntities: [{ type: "Topic", name: "쌀국수" }],
        userId: USER_ID,
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore([
          { name: "베트남 국수", type: "Topic", score: 0.7 },
        ]),
        embedding: mockEmbedding(),
        llm,
      });
      expect(result[0].isNew).toBe(true);
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it("handles LLM returning null matchedName", async () => {
      const result = await resolveEntities({
        extractedEntities: [{ type: "Topic", name: "리액트" }],
        userId: USER_ID,
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore([
          { name: "리액트 네이티브", type: "Topic", score: 0.65 },
        ]),
        embedding: mockEmbedding(),
        llm: mockLlm([
          {
            extractedName: "리액트",
            extractedType: "Topic",
            matchedName: null,
          },
        ]),
      });
      expect(result[0].isNew).toBe(true);
    });

    it("warns when LLM returns unrecognized extractedName", async () => {
      const result = await resolveEntities({
        extractedEntities: [{ type: "Topic", name: "쌀국수" }],
        userId: USER_ID,
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore([
          { name: "베트남 국수", type: "Topic", score: 0.7 },
        ]),
        embedding: mockEmbedding(),
        llm: mockLlm([
          {
            extractedName: "쌀 국수",
            extractedType: "Topic",
            matchedName: "베트남 국수",
          },
        ]),
      });
      // LLM이 이름을 변형("쌀국수" → "쌀 국수") → 매칭 실패 → 새 엔티티 + Sentry 경고
      expect(result[0].isNew).toBe(true);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("unrecognized entity"),
        expect.anything(),
      );
    });
  });

  describe("Neo4j 실패 격리", () => {
    it("falls back gracefully when Neo4j fails", async () => {
      const graphStore = mockGraphStore();
      (
        graphStore.findEntitiesByNormalizedNames as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Neo4j connection timeout"));
      const result = await resolveEntities({
        extractedEntities: [{ type: "Person", name: "Alice" }],
        userId: USER_ID,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      // Stage 1 스킵 → Stage 2(빈 결과) → 새 엔티티
      expect(result[0].isNew).toBe(true);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});

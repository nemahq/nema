import { describe, expect, it, vi } from "vitest";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphEntity, GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { EntityVectorStore } from "@server/infra/vector";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/node";

import { resolveEntities } from "./entity-resolution";

// --- Mock factories ---

function mockGraphStore(existingEntities: GraphEntity[] = []): GraphStore {
  return {
    ensureSchema: vi.fn(),
    upsertEntities: vi.fn(),
    findRelatedDocuments: vi.fn(),
    findDocumentsByEntities: vi.fn(),
    listEntities: vi.fn().mockResolvedValue(existingEntities),
    listEntitiesWithStats: vi.fn(),
    findDocumentsByEntity: vi.fn(),
    getRelatedEntities: vi.fn(),
    getEntityCountsByType: vi.fn(),
    mergeEntities: vi.fn(),
    deleteByDocument: vi.fn(),
    getGraph: vi.fn(),
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
      const existing: GraphEntity[] = [{ type: "Person", name: "Alice Kim" }];
      const result = await resolveEntities({
        extractedEntities: [
          { type: "Person", name: "alice  kim", nameEn: "Alice Kim" },
        ],
        userId: USER_ID,
        graphStore: mockGraphStore(existing),
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      expect(result).toEqual([
        expect.objectContaining({ name: "Alice Kim", isNew: false }),
      ]);
    });

    it("does not match different types with same name", async () => {
      const existing: GraphEntity[] = [
        { type: "Organization", name: "Python" },
      ];
      const graphStore = mockGraphStore(existing);
      // listEntities는 type 필터로 호출되므로, Topic 타입에 대해 빈 결과 반환
      (graphStore.listEntities as ReturnType<typeof vi.fn>).mockImplementation(
        async (opts: { type?: string }) =>
          opts.type === "Organization" ? existing : [],
      );

      const result = await resolveEntities({
        extractedEntities: [
          { type: "Topic", name: "Python", nameEn: "Python" },
        ],
        userId: USER_ID,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      expect(result[0].isNew).toBe(true);
    });
  });

  describe("Stage 2: 퍼지 매칭", () => {
    it("matches English name via Dice similarity", async () => {
      const existing: GraphEntity[] = [
        { type: "Organization", name: "Sequoia Capital Partners Fund" },
      ];
      const result = await resolveEntities({
        extractedEntities: [
          {
            type: "Organization",
            name: "Sequoia Capital Partners Funds",
            nameEn: "Sequoia Capital Partners Funds",
          },
        ],
        userId: USER_ID,
        graphStore: mockGraphStore(existing),
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      expect(result[0].isNew).toBe(false);
      expect(result[0].name).toBe("Sequoia Capital Partners Fund");
    });

    it("matches CJK name via bigram Dice (2-gram instead of 3-gram)", async () => {
      const existing: GraphEntity[] = [
        { type: "Organization", name: "세쿼이아 캐피탈" },
      ];
      const result = await resolveEntities({
        extractedEntities: [
          {
            type: "Organization",
            name: "세쿼이아 캐피탈스",
            nameEn: "Sequoia Capitals",
          },
        ],
        userId: USER_ID,
        graphStore: mockGraphStore(existing),
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      expect(result[0].isNew).toBe(false);
      expect(result[0].name).toBe("세쿼이아 캐피탈");
    });

    it("matches via overlap coefficient when Dice is below threshold but containment is high", async () => {
      const existing: GraphEntity[] = [{ type: "Event", name: "투자자 미팅" }];
      const result = await resolveEntities({
        extractedEntities: [
          { type: "Event", name: "투자자 미팅들", nameEn: "investor meetings" },
        ],
        userId: USER_ID,
        graphStore: mockGraphStore(existing),
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      // 길이 차이 1 + 높은 overlap → 매칭
      expect(result[0].isNew).toBe(false);
      expect(result[0].name).toBe("투자자 미팅");
    });

    it("skips fuzzy for low-entropy names", async () => {
      const existing: GraphEntity[] = [{ type: "Topic", name: "AI" }];
      // "AI" has very low entropy → fuzzy skipped → goes to Stage 3
      const result = await resolveEntities({
        extractedEntities: [{ type: "Topic", name: "AIs", nameEn: "AIs" }],
        userId: USER_ID,
        graphStore: mockGraphStore(existing),
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      // Stage 3 returns no candidates → new entity
      expect(result[0].isNew).toBe(true);
    });
  });

  describe("Stage 3: 임베딩 유사도", () => {
    it("passes candidates to Stage 4 LLM when embedding search finds matches", async () => {
      const llm = mockLlm([
        {
          extractedName: "베트남 쌀국수",
          extractedType: "Topic",
          matchedName: "쌀국수",
        },
      ]);
      const result = await resolveEntities({
        extractedEntities: [
          { type: "Topic", name: "베트남 쌀국수", nameEn: "Pho" },
        ],
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
        extractedEntities: [{ type: "Person", name: "테스트", nameEn: "Test" }],
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

  describe("Stage 4: LLM 판정", () => {
    it("treats all as new when LLM fails", async () => {
      const llm = mockLlm();
      (llm.generateStructured as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("LLM rate limit"),
      );
      const result = await resolveEntities({
        extractedEntities: [{ type: "Topic", name: "쌀국수", nameEn: "Pho" }],
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
        extractedEntities: [{ type: "Topic", name: "리액트", nameEn: "React" }],
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
        extractedEntities: [{ type: "Topic", name: "쌀국수", nameEn: "Pho" }],
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

  describe("listEntities 실패 격리", () => {
    it("falls back to empty list when Neo4j fails", async () => {
      const graphStore = mockGraphStore();
      (graphStore.listEntities as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Neo4j connection timeout"),
      );
      const result = await resolveEntities({
        extractedEntities: [{ type: "Person", name: "Alice", nameEn: "Alice" }],
        userId: USER_ID,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
        embedding: mockEmbedding(),
        llm: mockLlm(),
      });
      // Stage 1-2 스킵 → Stage 3(빈 결과) → 새 엔티티
      expect(result[0].isNew).toBe(true);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});

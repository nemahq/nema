import { describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";

const mockSearch = vi.fn();
const mockEmbeddingProvider = { providerId: "test" };
const mockVectorStore = { search: mockSearch };
// vi.mock은 파일 최상단으로 호이스트되므로 참조하는 mock은 vi.hoisted로 같이
// 끌어올려야 한다(그냥 const는 TDZ에 걸림) — source-service.integration.test.ts와
// 같은 이유.
const { mockLogSearch } = vi.hoisted(() => ({
  mockLogSearch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@server/infra/embedding", () => ({
  getEmbeddingProvider: () => mockEmbeddingProvider,
}));
vi.mock("@server/infra/vector", () => ({
  getVectorStore: () => mockVectorStore,
}));
vi.mock("@server/services/mcp-tool-call-log-service", () => ({
  logSearch: mockLogSearch,
}));

import { searchDigests } from "@server/services/digest-service";

function fakeSupabase(rows: unknown[]): TypedSupabaseClient {
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }),
  });
  return { from } as unknown as TypedSupabaseClient;
}

describe("searchDigests", () => {
  it("Qdrant 히트가 없으면 DB를 조회하지 않고 빈 배열을 반환한다", async () => {
    mockSearch.mockResolvedValue([]);
    const supabase = fakeSupabase([]);

    const result = await searchDigests({
      supabase,
      userId: "user-1",
      query: "질의",
      limit: 10,
    });

    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mockLogSearch).toHaveBeenCalledWith({
      supabase,
      userId: "user-1",
      detail: { query: "질의", results: [] },
    });
  });

  it("Qdrant 점수 순서를 DB round-trip 뒤에도 유지한다", async () => {
    const digestLowId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const digestHighId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const sourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    mockSearch.mockResolvedValue([
      { digestId: digestLowId, score: 0.5 },
      { digestId: digestHighId, score: 0.9 },
    ]);
    const supabase = fakeSupabase([
      {
        id: digestLowId,
        source_id: sourceId,
        type: "decision",
        title: "낮은 점수",
        body: { choice: "A" },
        created_at: "2026-08-13T00:00:00.000Z",
      },
      {
        id: digestHighId,
        source_id: sourceId,
        type: "decision",
        title: "높은 점수",
        body: { choice: "B" },
        created_at: "2026-08-13T00:00:00.000Z",
      },
    ]);

    const result = await searchDigests({
      supabase,
      userId: "user-1",
      query: "질의",
      limit: 10,
    });

    expect(result.map((r) => r.id)).toEqual([digestHighId, digestLowId]);
    expect(result[0]?.score).toBe(0.9);
    expect(mockLogSearch).toHaveBeenCalledWith({
      supabase,
      userId: "user-1",
      detail: {
        query: "질의",
        results: [
          { digestId: digestHighId, score: 0.9 },
          { digestId: digestLowId, score: 0.5 },
        ],
      },
    });
  });
});

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

const mockIs = vi.fn();

function fakeSupabase(rows: unknown[]): TypedSupabaseClient {
  mockIs.mockReset().mockResolvedValue({ data: rows, error: null });
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({ is: mockIs }),
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

  // 이 테스트가 지키는 계약: 가려진 다이제스트는 벡터가 실제 삭제되니 원래는 안
  // 걸리지만, deleteDigestVectors가 실패해도 던지지 않고 경고만 남기는 구조라
  // 고아 벡터가 남을 수 있다 — 그 벡터가 검색 결과로 돌아오지 않도록 Postgres
  // 쪽에서도 반드시 걸러야 한다. .is()가 통째로 지워지거나 다른 컬럼/값으로
  // 바뀌어도 이 단언이 잡는다(체인 모양만 우연히 맞는 것과 다르게, 호출 인자
  // 자체를 검증한다).
  it("가려진 다이제스트를 DB에서 뺄 때 hidden_at IS NULL 조건을 명시적으로 건다", async () => {
    mockSearch.mockResolvedValue([{ digestId: "any-id", score: 0.5 }]);

    await searchDigests({
      supabase: fakeSupabase([]),
      userId: "user-1",
      query: "질의",
      limit: 10,
    });

    expect(mockIs).toHaveBeenCalledWith("hidden_at", null);
  });

  // digest-service.ts의 로그 호출은 hits가 아니라 results(= DB round-trip 뒤
  // 살아남은 것)를 적는다는 주장을 코드로 검증한다 — .in()으로 걸러진 digest와
  // 벡터 hits가 갈리는 경우(예: 검색 이후 digest가 지워짐)를 재현해, 누군가 나중에
  // hits.map()으로 "단순화"해도 이 테스트가 회귀를 잡는다.
  it("벡터 hits가 DB에 없는 digest를 가리켜도, 로그와 반환값 둘 다 실제로 남아있는 것만 담는다", async () => {
    const digestAliveId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const digestGoneId1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const digestGoneId2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const sourceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    mockSearch.mockResolvedValue([
      { digestId: digestAliveId, score: 0.6 },
      { digestId: digestGoneId1, score: 0.9 },
      { digestId: digestGoneId2, score: 0.8 },
    ]);
    // .in()이 3개 중 살아있는 digest 1개만 돌려준다 — 나머지 둘은 검색 이후 지워진
    // 것으로 취급.
    const supabase = fakeSupabase([
      {
        id: digestAliveId,
        source_id: sourceId,
        type: "decision",
        title: "살아있는 다이제스트",
        body: { choice: "A" },
        created_at: "2026-08-13T00:00:00.000Z",
      },
    ]);

    const result = await searchDigests({
      supabase,
      userId: "user-1",
      query: "질의",
      limit: 10,
    });

    expect(result.map((r) => r.id)).toEqual([digestAliveId]);
    expect(mockLogSearch).toHaveBeenCalledWith({
      userId: "user-1",
      detail: {
        query: "질의",
        results: [{ digestId: digestAliveId, score: 0.6 }],
      },
    });
  });
});

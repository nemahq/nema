import { describe, expect, it, vi } from "vitest";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { VectorStore } from "@server/infra/vector";

import { assembleSourceGroups, searchStatements } from "./statement-search";

function claim(args: {
  id: string;
  sourceId: string;
  orderIndex?: number | null;
  sourceCreatedAt?: string;
  createdAt?: string;
}) {
  return {
    id: args.id,
    content: `내용 ${args.id}`,
    type: "claim" as const,
    confidence: "certain" as const,
    createdAt: args.createdAt ?? "2026-06-11T00:00:00Z",
    sources: [
      {
        sourceId: args.sourceId,
        sourceCreatedAt: args.sourceCreatedAt ?? "2026-06-10T00:00:00Z",
        orderIndex: args.orderIndex ?? null,
      },
    ],
  };
}

describe("assembleSourceGroups", () => {
  it("묶음 간은 묶음 내 최고 score 내림차순으로 정렬한다", () => {
    const groups = assembleSourceGroups({
      statements: [
        claim({ id: "a1", sourceId: "src-a" }),
        claim({ id: "b1", sourceId: "src-b" }),
        claim({ id: "b2", sourceId: "src-b" }),
      ],
      // src-b는 평균이 낮아도 최고점(0.9)이 src-a(0.8)보다 높아 위로
      scoreByStatementId: new Map([
        ["a1", 0.8],
        ["b1", 0.9],
        ["b2", 0.3],
      ]),
      activeCountBySourceId: new Map([
        ["src-a", 1],
        ["src-b", 2],
      ]),
    });

    expect(groups.map((g) => g.key.sourceId)).toEqual(["src-b", "src-a"]);
  });

  it("묶음 안은 score가 아니라 원문 순서(locator.index)로 정렬한다", () => {
    const groups = assembleSourceGroups({
      statements: [
        claim({ id: "s3", sourceId: "src", orderIndex: 2 }),
        claim({ id: "s1", sourceId: "src", orderIndex: 0 }),
        claim({ id: "s2", sourceId: "src", orderIndex: 1 }),
      ],
      // 점수 순서(s2 > s3 > s1)와 원문 순서가 다른 상황
      scoreByStatementId: new Map([
        ["s1", 0.61],
        ["s2", 0.95],
        ["s3", 0.7],
      ]),
      activeCountBySourceId: new Map([["src", 3]]),
    });

    expect(groups[0]?.statements.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("locator가 없는 진술은 묶음 안 맨 뒤로 보낸다", () => {
    const groups = assembleSourceGroups({
      statements: [
        claim({ id: "no-locator", sourceId: "src", orderIndex: null }),
        claim({ id: "first", sourceId: "src", orderIndex: 0 }),
      ],
      scoreByStatementId: new Map([
        ["no-locator", 0.9],
        ["first", 0.7],
      ]),
      activeCountBySourceId: new Map([["src", 2]]),
    });

    expect(groups[0]?.statements.map((s) => s.id)).toEqual([
      "first",
      "no-locator",
    ]);
  });

  it("totalStatementCount는 닿은 수가 아니라 원본의 전체 active 진술 수다", () => {
    const groups = assembleSourceGroups({
      statements: [claim({ id: "hit", sourceId: "src", orderIndex: 0 })],
      scoreByStatementId: new Map([["hit", 0.8]]),
      // 검색에 닿은 건 1개지만 원본엔 active 진술이 5개 — 화면의 "다른 진술 N개" 근거
      activeCountBySourceId: new Map([["src", 5]]),
    });

    expect(groups[0]?.totalStatementCount).toBe(5);
    expect(groups[0]?.statements).toHaveLength(1);
  });

  it("여러 원본에 속한 진술은 각 원본 묶음에 모두 나타난다", () => {
    const shared = {
      ...claim({ id: "shared", sourceId: "src-a", orderIndex: 0 }),
      sources: [
        {
          sourceId: "src-a",
          sourceCreatedAt: "2026-06-10T00:00:00Z",
          orderIndex: 0,
        },
        {
          sourceId: "src-b",
          sourceCreatedAt: "2026-06-09T00:00:00Z",
          orderIndex: 3,
        },
      ],
    };

    const groups = assembleSourceGroups({
      statements: [shared],
      scoreByStatementId: new Map([["shared", 0.8]]),
      activeCountBySourceId: new Map([
        ["src-a", 1],
        ["src-b", 4],
      ]),
    });

    expect(groups.map((g) => g.key.sourceId).sort()).toEqual([
      "src-a",
      "src-b",
    ]);
    for (const group of groups) {
      expect(group.statements.map((s) => s.id)).toEqual(["shared"]);
    }
  });

  it("묶음 key에 kind와 원본 시점이 실린다", () => {
    const groups = assembleSourceGroups({
      statements: [
        claim({
          id: "s",
          sourceId: "src",
          orderIndex: 0,
          sourceCreatedAt: "2026-01-02T03:04:05Z",
        }),
      ],
      scoreByStatementId: new Map([["s", 0.8]]),
      activeCountBySourceId: new Map([["src", 1]]),
    });

    expect(groups[0]?.key).toEqual({
      kind: "source",
      sourceId: "src",
      sourceCreatedAt: "2026-01-02T03:04:05Z",
    });
  });
});

// --- searchStatements: 체인 기록 + 캔 응답 stub으로 오케스트레이션 검증 ---

interface QueryStub {
  calls: unknown[][];
  select: (...args: unknown[]) => QueryStub;
  in: (...args: unknown[]) => QueryStub;
  eq: (...args: unknown[]) => QueryStub;
  then: (resolve: (value: { data: unknown; error: null }) => void) => void;
}

function queryStub(rows: unknown[]): QueryStub {
  const calls: unknown[][] = [];
  const chain = (name: string) => {
    return (...args: unknown[]) => {
      calls.push([name, ...args]);
      return stub;
    };
  };
  const stub: QueryStub = {
    calls,
    select: chain("select"),
    in: chain("in"),
    eq: chain("eq"),
    then: (resolve) => {
      resolve({ data: rows, error: null });
    },
  };
  return stub;
}

function supabaseStub(responses: Record<string, QueryStub[]>) {
  return {
    from: (table: string) => {
      const next = responses[table]?.shift();
      if (!next) {
        throw new Error(`Unexpected query on table: ${table}`);
      }
      return next;
    },
  } as unknown as TypedSupabaseClient;
}

function providersStub(searchMock: ReturnType<typeof vi.fn>): Providers {
  const vectorStore: VectorStore = {
    ensureCollection: vi.fn(),
    upsertStatements: vi.fn(),
    deleteStatements: vi.fn(),
    search: searchMock,
  };
  return {
    llm: null as never, // 꺼내기 경로엔 LLM이 없다
    embedding: {
      providerId: "test",
      model: "test-model",
      dimension: 1024,
      embed: vi.fn(),
    },
    vectorStore,
  };
}

function statementRow(args: {
  id: string;
  sourceId: string;
  locator: unknown;
}) {
  return {
    id: args.id,
    content: `내용 ${args.id}`,
    type: "claim",
    confidence: "certain",
    created_at: "2026-06-11T00:00:00Z",
    statement_sources: [
      {
        source_id: args.sourceId,
        locator: args.locator,
        sources: { created_at: "2026-06-10T00:00:00Z" },
      },
    ],
  };
}

describe("searchStatements", () => {
  it("멤버인 Space가 없으면 임베딩·Qdrant 호출 없이 빈 결과", async () => {
    const search = vi.fn();
    const result = await searchStatements({
      supabase: supabaseStub({ space_members: [queryStub([])] }),
      providers: providersStub(search),
      query: "질문",
    });

    expect(result).toEqual({ groups: [] });
    expect(search).not.toHaveBeenCalled();
  });

  it("원장 재조회는 active만 — archived 벡터가 남아 있어도 거른다", async () => {
    const search = vi.fn().mockResolvedValue([
      { statementId: "s1", score: 0.9 },
      { statementId: "s-archived", score: 0.95 },
    ]);
    // 원장은 active 필터가 걸린 결과만 돌려준다 — archived 행은 응답에 없음
    const statementsQuery = queryStub([
      statementRow({ id: "s1", sourceId: "src", locator: { index: 0 } }),
    ]);

    const result = await searchStatements({
      supabase: supabaseStub({
        space_members: [queryStub([{ space_id: "space-1" }])],
        statements: [statementsQuery],
        statement_sources: [queryStub([{ source_id: "src" }])],
      }),
      providers: providersStub(search),
      query: "질문",
    });

    // 필터가 빠지는 회귀를 막는 핵심 단언 — archived 거름은 이 체인이 전부다
    expect(statementsQuery.calls).toContainEqual(["eq", "status", "active"]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.statements.map((s) => s.id)).toEqual(["s1"]);
  });

  it("locator index 0은 falsy 강제 없이 원문 첫 자리로 산다", async () => {
    const search = vi.fn().mockResolvedValue([
      { statementId: "first", score: 0.6 },
      { statementId: "second", score: 0.99 },
    ]);

    const result = await searchStatements({
      supabase: supabaseStub({
        space_members: [queryStub([{ space_id: "space-1" }])],
        statements: [
          queryStub([
            statementRow({
              id: "second",
              sourceId: "src",
              locator: { index: 1 },
            }),
            statementRow({
              id: "first",
              sourceId: "src",
              locator: { index: 0 },
            }),
          ]),
        ],
        statement_sources: [
          queryStub([{ source_id: "src" }, { source_id: "src" }]),
        ],
      }),
      providers: providersStub(search),
      query: "질문",
    });

    // index 0이 ||류 강제로 null 취급되면 first가 맨 뒤로 밀린다
    expect(result.groups[0]?.statements.map((s) => s.id)).toEqual([
      "first",
      "second",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { listTopics } from "./topic-service";

interface QueryStub {
  calls: unknown[][];
  select: (...args: unknown[]) => QueryStub;
  eq: (...args: unknown[]) => QueryStub;
  order: (...args: unknown[]) => QueryStub;
  then: (resolve: (result: { data: unknown[]; error: null }) => void) => void;
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
    eq: chain("eq"),
    order: chain("order"),
    then: (resolve) => {
      resolve({ data: rows, error: null });
    },
  };
  return stub;
}

function supabaseStub(query: QueryStub): TypedSupabaseClient {
  return { from: () => query } as unknown as TypedSupabaseClient;
}

// Digest 리뷰의 "기존 Topic 검색"(topic.list)이 spaceId 없이 RLS에만 기대면 사용자가
// 소속된 다른 Space의 동명 Topic까지 "기존"으로 노출돼 조용히 오재사용된다 — 이 필터가
// 빠지는 회귀를 막는 핵심 단언(statement-search.test.ts의 active 필터 단언과 같은 결).
describe("listTopics", () => {
  it("spaceId를 주면 그 Space로 필터한다", async () => {
    const query = queryStub([]);

    await listTopics({ supabase: supabaseStub(query), spaceId: "space-1" });

    expect(query.calls).toContainEqual(["eq", "space_id", "space-1"]);
  });

  it("spaceId를 안 주면 필터 없이 전체(소속된 모든 Space)를 반환한다", async () => {
    const query = queryStub([]);

    await listTopics({ supabase: supabaseStub(query) });

    expect(
      query.calls.some((call) => call[0] === "eq" && call[1] === "space_id"),
    ).toBe(false);
  });
});

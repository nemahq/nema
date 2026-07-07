import { describe, expect, it } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { fetchMergedSourceIds } from "./source-service";

// 테이블별 canned rows를 돌려주는 .from 체인 stub — select/eq/in 무시하고 then으로 resolve.
// fetchMergedSourceIds는 statement_relations·statement_sources 두 테이블을 각각 조회한다.
function mockSupabase(byTable: Record<string, unknown[]>): TypedSupabaseClient {
  const from = (table: string) => {
    const stub: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in"]) {
      stub[method] = () => stub;
    }
    stub["then"] = (resolve: (value: { data: unknown; error: null }) => void) =>
      resolve({ data: byTable[table] ?? [], error: null });
    return stub;
  };
  return { from } as unknown as TypedSupabaseClient;
}

const KEEPER = "11111111-1111-4111-a111-111111111111";
const DUP = "22222222-2222-4222-a222-222222222222";
const OWN = "aaaaaaaa-0000-4000-a000-000000000001";

describe("fetchMergedSourceIds", () => {
  it("keeper=from인 active duplicates 관계의 to를 keeper별로 모으고 ownSourceId는 뺀다", async () => {
    const result = await fetchMergedSourceIds({
      supabase: mockSupabase({
        statement_relations: [{ from_id: KEEPER, to_id: DUP }],
        statement_sources: [
          { statement_id: DUP, source_id: "other-1" },
          { statement_id: DUP, source_id: OWN }, // 지금 보는 글은 제외
        ],
      }),
      keeperIds: [KEEPER],
      ownSourceId: OWN,
    });
    expect(result).toEqual(new Map([[KEEPER, ["other-1"]]]));
  });

  it("중복의 출처가 지금 보는 글뿐이면 keeper는 결과에서 빠진다 — cross-source 보강만 센다", async () => {
    const result = await fetchMergedSourceIds({
      supabase: mockSupabase({
        statement_relations: [{ from_id: KEEPER, to_id: DUP }],
        statement_sources: [{ statement_id: DUP, source_id: OWN }],
      }),
      keeperIds: [KEEPER],
      ownSourceId: OWN,
    });
    expect(result.size).toBe(0);
  });

  it("한 keeper에 중복이 여러이고 출처가 겹치면 중복 제거해 모은다", async () => {
    const DUP2 = "33333333-3333-4333-a333-333333333333";
    const result = await fetchMergedSourceIds({
      supabase: mockSupabase({
        statement_relations: [
          { from_id: KEEPER, to_id: DUP },
          { from_id: KEEPER, to_id: DUP2 },
        ],
        statement_sources: [
          { statement_id: DUP, source_id: "s1" },
          { statement_id: DUP2, source_id: "s1" },
          { statement_id: DUP2, source_id: "s2" },
        ],
      }),
      keeperIds: [KEEPER],
      ownSourceId: OWN,
    });
    expect(result.get(KEEPER)?.sort()).toEqual(["s1", "s2"]);
  });

  it("active duplicates 관계가 없으면 두 번째 조회 없이 빈 맵", async () => {
    const result = await fetchMergedSourceIds({
      supabase: mockSupabase({ statement_relations: [] }),
      keeperIds: [KEEPER],
      ownSourceId: OWN,
    });
    expect(result.size).toBe(0);
  });

  it("keeper가 없으면 빈 맵", async () => {
    const result = await fetchMergedSourceIds({
      supabase: mockSupabase({}),
      keeperIds: [],
      ownSourceId: OWN,
    });
    expect(result.size).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/infra/statement-sync", () => ({
  abortDigestion: vi.fn(),
}));

import { abortDigestion } from "@server/infra/statement-sync";
import type { TypedSupabaseClient } from "@server/infra/supabase";

import {
  cancelSourceDigestion,
  createSource,
  fetchMergedSourceIds,
} from "./source-service";

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

const EXPLICIT_SPACE = "44444444-4444-4444-a444-444444444444";
const OLDEST_SPACE = "55555555-5555-4555-a555-555555555555";

describe("createSource", () => {
  it("spaceId가 주어지면 그대로 RPC에 쓰고 space_members는 조회하지 않는다", async () => {
    const rpcCalls: unknown[] = [];
    const supabase = {
      from: () => {
        throw new Error("spaceId가 있는데 space_members를 조회했다");
      },
      rpc: (fn: string, params: unknown) => {
        rpcCalls.push({ fn, params });
        return { data: "new-source-id", error: null };
      },
    } as unknown as TypedSupabaseClient;

    const result = await createSource({
      supabase,
      body: "hello",
      spaceId: EXPLICIT_SPACE,
    });

    expect(result).toEqual({ sourceId: "new-source-id" });
    expect(rpcCalls).toEqual([
      {
        fn: "create_source",
        params: { p_space_id: EXPLICIT_SPACE, p_body: "hello" },
      },
    ]);
  });

  it("spaceId가 없으면 가장 오래된 space_members 행을 조회해 그걸 쓴다", async () => {
    const rpcCalls: unknown[] = [];
    const membershipStub: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit"]) {
      membershipStub[method] = () => membershipStub;
    }
    membershipStub["single"] = () => ({
      data: { space_id: OLDEST_SPACE },
      error: null,
    });
    const supabase = {
      from: () => membershipStub,
      rpc: (fn: string, params: unknown) => {
        rpcCalls.push({ fn, params });
        return { data: "new-source-id", error: null };
      },
    } as unknown as TypedSupabaseClient;

    const result = await createSource({ supabase, body: "hello" });

    expect(result).toEqual({ sourceId: "new-source-id" });
    expect(rpcCalls).toEqual([
      {
        fn: "create_source",
        params: { p_space_id: OLDEST_SPACE, p_body: "hello" },
      },
    ]);
  });
});

// --- 초안 액션 취소 (intake-flow "처리 중 취소") ---

const CANCEL_SOURCE_ID = "cccccccc-0000-4000-a000-000000000001";

function mockRpcSupabase(error: { message: string } | null) {
  const rpc = vi.fn(async () => ({ data: null, error }));
  return { supabase: { rpc } as unknown as TypedSupabaseClient, rpc };
}

describe("cancelSourceDigestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("RPC로 취소를 확정한 뒤에야 떠 있는 콜을 끊는다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await cancelSourceDigestion({ supabase, sourceId: CANCEL_SOURCE_ID });

    expect(rpc).toHaveBeenCalledWith("cancel_source_digestion", {
      p_source_id: CANCEL_SOURCE_ID,
    });
    expect(abortDigestion).toHaveBeenCalledWith(CANCEL_SOURCE_ID);
  });

  it("RPC가 거부하면 콜을 끊지 않는다 — 멤버십 검증이 RPC 안에 있어, abort를 앞세우면 남의 Space 처리를 방해할 수 있다", async () => {
    const { supabase } = mockRpcSupabase({
      message:
        "source ... is not a source being digested that the caller can cancel",
    });

    await expect(
      cancelSourceDigestion({ supabase, sourceId: CANCEL_SOURCE_ID }),
    ).rejects.toThrow();

    expect(abortDigestion).not.toHaveBeenCalled();
  });
});

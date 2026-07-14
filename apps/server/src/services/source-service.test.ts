import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/infra/statement-sync", () => ({
  abortDigestion: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/node";

import type { Providers } from "@server/infra/providers";
import { abortDigestion } from "@server/infra/statement-sync";
import type { TypedSupabaseClient } from "@server/infra/supabase";

import {
  cancelSourceDigestion,
  createSource,
  deleteSource,
  fetchMergedSourceIds,
  fillSourceTitle,
  reassignSourceSpace,
  startSourceDigestion,
  updateSourceBody,
  updateSourceTitle,
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

describe("startSourceDigestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("추출 실행은 RPC 하나로 끝난다 — 떠 있는 콜이 없으니 abort는 부르지 않는다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await startSourceDigestion({ supabase, sourceId: CANCEL_SOURCE_ID });

    expect(rpc).toHaveBeenCalledWith("start_source_digestion", {
      p_source_id: CANCEL_SOURCE_ID,
    });
    expect(abortDigestion).not.toHaveBeenCalled();
  });

  it("가드가 지면(리뷰가 이미 열림 등) 오류를 그대로 올린다", async () => {
    const { supabase } = mockRpcSupabase({
      message: "source ... already has a review awaiting confirmation",
    });

    await expect(
      startSourceDigestion({ supabase, sourceId: CANCEL_SOURCE_ID }),
    ).rejects.toThrow();
  });
});

describe("deleteSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 완전 삭제의 정본은 trash_source다 — 결정 #2대로 사용자에겐 복원 표면이 없고,
  // 백엔드의 30일 purge 유예는 사용자 눈에 안 보이는 backstop이다.
  it("삭제는 기존 trash_source RPC를 그대로 쓴다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await deleteSource({ supabase, sourceId: CANCEL_SOURCE_ID });

    expect(rpc).toHaveBeenCalledWith("trash_source", {
      p_source_id: CANCEL_SOURCE_ID,
    });
  });

  it("처리 중이라 가드가 지면 오류를 그대로 올린다", async () => {
    const { supabase } = mockRpcSupabase({
      message: "source ... is not an idle pending source the caller can trash",
    });

    await expect(
      deleteSource({ supabase, sourceId: CANCEL_SOURCE_ID }),
    ).rejects.toThrow();
  });
});

// --- 초안에서 Space 재지정 (intake-flow "초안에서 Space 재지정") ---

const TARGET_SPACE_ID = "dddddddd-0000-4000-a000-000000000001";

describe("reassignSourceSpace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("RPC로 source·spaceId를 그대로 넘긴다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await reassignSourceSpace({
      supabase,
      sourceId: CANCEL_SOURCE_ID,
      spaceId: TARGET_SPACE_ID,
    });

    expect(rpc).toHaveBeenCalledWith("reassign_source_space", {
      p_source_id: CANCEL_SOURCE_ID,
      p_space_id: TARGET_SPACE_ID,
    });
  });

  it("처리 중이거나 대상 Space 멤버가 아니라 가드가 지면 오류를 그대로 올린다", async () => {
    const { supabase } = mockRpcSupabase({
      message:
        "source ... is not an idle pending source the caller can reassign to space ...",
    });

    await expect(
      reassignSourceSpace({
        supabase,
        sourceId: CANCEL_SOURCE_ID,
        spaceId: TARGET_SPACE_ID,
      }),
    ).rejects.toThrow();
  });
});

describe("updateSourceTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("update_source_title RPC로 제목을 반영한다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await updateSourceTitle({
      supabase,
      sourceId: CANCEL_SOURCE_ID,
      title: "새 제목",
    });

    expect(rpc).toHaveBeenCalledWith("update_source_title", {
      p_source_id: CANCEL_SOURCE_ID,
      p_title: "새 제목",
    });
  });

  it("처리 중이거나 pending이 아니라 가드가 지면 오류를 그대로 올린다", async () => {
    const { supabase } = mockRpcSupabase({
      message: "source ... is not an idle draft the caller can retitle",
    });

    await expect(
      updateSourceTitle({
        supabase,
        sourceId: CANCEL_SOURCE_ID,
        title: "새 제목",
      }),
    ).rejects.toThrow();
  });
});

// --- 재추출 전에 원본 고치기 ---

describe("updateSourceBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("update_source_body RPC로 원본을 반영한다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await updateSourceBody({
      supabase,
      sourceId: CANCEL_SOURCE_ID,
      body: "고친 원본",
    });

    expect(rpc).toHaveBeenCalledWith("update_source_body", {
      p_source_id: CANCEL_SOURCE_ID,
      p_body: "고친 원본",
    });
  });

  // 리뷰가 열린 채로 원본이 바뀌면 화면의 Digest 후보들이 더는 존재하지 않는 문장에서
  // 나온 것이 된다 — 가드는 RPC 안에 있고, 서비스는 그 거부를 삼키지 않아야 한다.
  it("처리 중이거나 리뷰가 열려 가드가 지면 오류를 그대로 올린다", async () => {
    const { supabase } = mockRpcSupabase({
      message: "source ... is not an idle draft the caller can rewrite",
    });

    await expect(
      updateSourceBody({
        supabase,
        sourceId: CANCEL_SOURCE_ID,
        body: "고친 원본",
      }),
    ).rejects.toThrow();
  });
});

// --- Source 제목 생성 (생성 직후 1회, 뒤에서 도는 부수효과) ---

function titleProviders(generateText: () => Promise<string>): Providers {
  return {
    llm: { forTask: () => ({ generateText }) },
  } as unknown as Providers;
}

describe("fillSourceTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LLM이 뽑은 제목을 fill_source_title RPC로 채운다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    fillSourceTitle({
      supabase,
      providers: titleProviders(async () => "  배포 도구 선정  "),
      sourceId: CANCEL_SOURCE_ID,
      body: "배포 도구 다시 봤는데 Railway가 나을 듯",
    });

    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("fill_source_title", {
        p_source_id: CANCEL_SOURCE_ID,
        p_title: "배포 도구 선정",
      }),
    );
  });

  // 제목은 없어도 그만인 값이다(화면은 body 미리보기로 그린다) — 제목 콜이 죽었다고
  // 원본 저장(이미 커밋된)이 오류로 되돌아오면 사용자는 글을 잃은 걸로 읽는다.
  it("LLM이 실패해도 던지지 않는다 — 원본 저장은 이미 끝난 일이다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    expect(() =>
      fillSourceTitle({
        supabase,
        providers: titleProviders(() =>
          Promise.reject(new Error("nano is down")),
        ),
        sourceId: CANCEL_SOURCE_ID,
        body: "아무 글",
      }),
    ).not.toThrow();

    await vi.waitFor(() => expect(Sentry.captureException).toHaveBeenCalled());
    expect(rpc).not.toHaveBeenCalled();
  });
});

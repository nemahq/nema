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
  deleteSources,
  fetchMergedSourceIds,
  listPendingSources,
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
    for (const method of ["select", "eq", "in", "order", "limit"]) {
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

const SPACE_ID = "77777777-7777-4777-a777-777777777777";
const SOURCE_A = "88888888-8888-4888-a888-888888888888";
const SOURCE_B = "99999999-9999-4999-a999-999999999999";

const CREATED_AT = "2026-07-17T00:00:00.000Z";

function pendingSourceRow(args: {
  id: string;
  digestionStatus?: "pending" | "failed" | "cancelled" | "completed";
  lastDigestionAttempt?: string | null;
  digestionStartedAt?: string | null;
  digestionInputUpdatedAt?: string;
}) {
  return {
    id: args.id,
    space_id: SPACE_ID,
    body: "본문",
    title: null,
    created_at: CREATED_AT,
    digestion_status: args.digestionStatus ?? "completed",
    last_digestion_attempt: args.lastDigestionAttempt ?? null,
    digestion_started_at: args.digestionStartedAt ?? null,
    digestion_input_updated_at: args.digestionInputUpdatedAt ?? CREATED_AT,
    error_message: null,
  };
}

describe("listPendingSources", () => {
  it("rejected changeset만 있으면 digestionOutcome=discarded, review는 null", async () => {
    const { items } = await listPendingSources({
      supabase: mockSupabase({
        sources: [pendingSourceRow({ id: SOURCE_A })],
        changesets: [
          {
            id: "cs-rejected",
            source_id: SOURCE_A,
            status: "rejected",
            changes: [],
          },
        ],
      }),
    });

    expect(items).toEqual([
      expect.objectContaining({
        sourceId: SOURCE_A,
        review: null,
        digestCount: 0,
        digestionOutcome: "discarded",
      }),
    ]);
  });

  it("pending+rejected가 같은 원본에 함께 있으면(재시도) pending을 리뷰로 쓰면서도 discarded는 유지", async () => {
    const { items } = await listPendingSources({
      supabase: mockSupabase({
        sources: [pendingSourceRow({ id: SOURCE_A })],
        changesets: [
          {
            id: "cs-rejected-old",
            source_id: SOURCE_A,
            status: "rejected",
            changes: [],
          },
          {
            id: "cs-pending-new",
            number: 7,
            source_id: SOURCE_A,
            status: "pending",
            changes: [{ target_type: "digest" }, { target_type: "reference" }],
          },
        ],
      }),
    });

    expect(items).toEqual([
      expect.objectContaining({
        sourceId: SOURCE_A,
        review: { changesetId: "cs-pending-new", changesetNumber: 7 },
        digestCount: 1,
        digestionOutcome: "discarded",
      }),
    ]);
  });

  it("마지막 정리 이후 입력이 바뀌었으면 inputChangedSinceDigestion=true", async () => {
    const { items } = await listPendingSources({
      supabase: mockSupabase({
        sources: [
          pendingSourceRow({
            id: SOURCE_A,
            digestionStatus: "completed",
            lastDigestionAttempt: "2026-07-17T01:00:00.000Z",
            digestionInputUpdatedAt: "2026-07-17T02:00:00.000Z",
          }),
        ],
        changesets: [],
      }),
    });

    expect(items[0]).toEqual(
      expect.objectContaining({ inputChangedSinceDigestion: true }),
    );
  });

  it("입력 변경 뒤에 정리가 다시 돌았으면 false — 재정리 게이트가 도로 닫힌다", async () => {
    const { items } = await listPendingSources({
      supabase: mockSupabase({
        sources: [
          pendingSourceRow({
            id: SOURCE_A,
            digestionStatus: "completed",
            lastDigestionAttempt: "2026-07-17T03:00:00.000Z",
            digestionInputUpdatedAt: "2026-07-17T02:00:00.000Z",
          }),
        ],
        changesets: [],
      }),
    });

    expect(items[0]).toEqual(
      expect.objectContaining({ inputChangedSinceDigestion: false }),
    );
  });

  // v1 파이프라인 시절 원본은 digestion_status만 completed로 소급되고 시도 시각은
  // NULL로 남았다(20260707100000). 잠그는 쪽으로 판정하면 그 초안들이 영구히 묶여
  // 재정리가 불가능해지므로, 판정 불가는 여는 쪽으로 떨어져야 한다.
  it("정리 시도 시각이 없으면 열어준다 — 레거시 초안이 영구히 잠기지 않게", async () => {
    const { items } = await listPendingSources({
      supabase: mockSupabase({
        sources: [
          pendingSourceRow({
            id: SOURCE_A,
            digestionStatus: "completed",
            lastDigestionAttempt: null,
            digestionInputUpdatedAt: CREATED_AT,
          }),
        ],
        changesets: [],
      }),
    });

    expect(items[0]).toEqual(
      expect.objectContaining({
        digestionOutcome: "empty",
        inputChangedSinceDigestion: true,
      }),
    );
  });

  it("changeset이 전혀 없으면 진짜 결과없음 — digestionOutcome=empty", async () => {
    const { items } = await listPendingSources({
      supabase: mockSupabase({
        sources: [pendingSourceRow({ id: SOURCE_B })],
        changesets: [],
      }),
    });

    expect(items).toEqual([
      expect.objectContaining({
        sourceId: SOURCE_B,
        review: null,
        digestionOutcome: "empty",
      }),
    ]);
  });

  it.each([
    ["pending", "processing"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
  ] as const)(
    "digestion_status=%s → digestionOutcome=%s (rejected 이력과 무관)",
    async (digestionStatus, outcome) => {
      const { items } = await listPendingSources({
        supabase: mockSupabase({
          sources: [pendingSourceRow({ id: SOURCE_A, digestionStatus })],
          changesets: [
            {
              id: "cs-rejected",
              source_id: SOURCE_A,
              status: "rejected",
              changes: [],
            },
          ],
        }),
      });

      expect(items[0]?.digestionOutcome).toBe(outcome);
    },
  );
});

const EXPLICIT_SPACE = "44444444-4444-4444-a444-444444444444";
const OLDEST_SPACE = "55555555-5555-4555-a555-555555555555";
const NEW_SOURCE_ID = "66666666-6666-4666-a666-666666666666";

function rpcNames(rpc: ReturnType<typeof vi.fn>): string[] {
  return rpc.mock.calls.map(([name]) => name as string);
}

// create_source는 새 id를, 그 뒤 제목 채우기는 아무것도 안 돌려준다.
// fillError를 주면 제목 채우기 RPC만 실패한다(박제는 성공).
function titleSupabase(fillError?: { message: string }) {
  const rpc = vi.fn(async (fn: string) => ({
    data: fn === "create_source" ? NEW_SOURCE_ID : null,
    error: fn === "fill_source_title" ? (fillError ?? null) : null,
  }));
  return { supabase: { rpc } as unknown as TypedSupabaseClient, rpc };
}

function titleProviders(generateText: () => Promise<string>): Providers {
  return {
    llm: { forTask: () => ({ generateText }) },
  } as unknown as Providers;
}

// 제목 콜은 뒤에서 도는 부수효과라, 박제 경로만 보는 테스트에선 안 뜨게 막아둔다
const NO_TITLE_CALL = titleProviders(() => new Promise<string>(() => {}));

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
      providers: NO_TITLE_CALL,
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

    const result = await createSource({
      supabase,
      providers: NO_TITLE_CALL,
      body: "hello",
    });

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

describe("deleteSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // sourceId별로 결과를 다르게 주는 rpc mock — deleteSources는 trash_source를
  // sourceId마다 개별 호출하므로, id를 보고 성공/충돌/예상밖 실패를 갈라줘야 한다.
  function mockPerSourceRpc(
    outcomes: Record<string, { code: string; message: string } | null>,
  ) {
    const rpc = vi.fn(async (_fn: string, args: { p_source_id: string }) => ({
      data: null,
      error: outcomes[args.p_source_id] ?? null,
    }));
    return { supabase: { rpc } as unknown as TypedSupabaseClient, rpc };
  }

  const ID_A = "eeeeeeee-0000-4000-a000-000000000001";
  const ID_B = "eeeeeeee-0000-4000-a000-000000000002";
  const ID_C = "eeeeeeee-0000-4000-a000-000000000003";

  it("전부 성공하면 failedCount 0", async () => {
    const { supabase } = mockPerSourceRpc({});

    const result = await deleteSources({
      supabase,
      sourceIds: [ID_A, ID_B],
    });

    expect(result).toEqual({ failedCount: 0 });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("동시성 충돌(NM004)은 실패로 안 세고 Sentry로도 안 올린다 — 원하는 최종 상태에 이미 수렴했거나 곧 수렴하는 정상 결과", async () => {
    const { supabase } = mockPerSourceRpc({
      [ID_A]: {
        code: "NM004",
        message:
          "source ... is not an idle pending source the caller can trash",
      },
    });

    const result = await deleteSources({ supabase, sourceIds: [ID_A, ID_B] });

    expect(result).toEqual({ failedCount: 0 });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("예상 밖 실패만 failedCount에 세고 Sentry로 올린다", async () => {
    const { supabase } = mockPerSourceRpc({
      [ID_A]: { code: "XXUNKNOWN", message: "boom" },
      [ID_B]: {
        code: "NM004",
        message:
          "source ... is not an idle pending source the caller can trash",
      },
    });

    const result = await deleteSources({
      supabase,
      sourceIds: [ID_A, ID_B, ID_C],
    });

    expect(result).toEqual({ failedCount: 1 });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
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

describe("createSource — 제목 생성", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("생성 직후 LLM이 뽑은 제목을 fill_source_title로 채운다", async () => {
    const { supabase, rpc } = titleSupabase();

    await createSource({
      supabase,
      providers: titleProviders(async () => "  배포 도구 선정  "),
      body: "배포 도구 다시 봤는데 Railway가 나을 듯",
      spaceId: EXPLICIT_SPACE,
    });

    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("fill_source_title", {
        p_source_id: NEW_SOURCE_ID,
        p_title: "배포 도구 선정",
      }),
    );
  });

  // 제목은 없어도 그만인 값이다(화면은 body 미리보기로 그린다) — 제목 콜이 죽었다고
  // 이미 커밋된 원본 저장이 오류로 되돌아오면 사용자는 글을 잃은 걸로 읽는다.
  it("제목 콜이 실패해도 원본 저장은 성공으로 끝난다", async () => {
    const { supabase, rpc } = titleSupabase();

    const result = await createSource({
      supabase,
      providers: titleProviders(() =>
        Promise.reject(new Error("nano is down")),
      ),
      body: "아무 글",
      spaceId: EXPLICIT_SPACE,
    });

    expect(result).toEqual({ sourceId: NEW_SOURCE_ID });
    await vi.waitFor(() => expect(Sentry.captureException).toHaveBeenCalled());
    expect(rpcNames(rpc)).not.toContain("fill_source_title");
  });

  // 제목 채우기 실패는 사용자에게 보일 표면이 없다 — Sentry가 유일한 창구라, 여기가
  // 무음이면 제목이 조직적으로 안 붙어도 아무도 모른다.
  it("제목 채우기 RPC가 실패하면 Sentry로 보고한다 — 저장은 그대로 성공", async () => {
    const { supabase } = titleSupabase({ message: "db is down" });

    const result = await createSource({
      supabase,
      providers: titleProviders(async () => "배포 도구 선정"),
      body: "아무 글",
      spaceId: EXPLICIT_SPACE,
    });

    expect(result).toEqual({ sourceId: NEW_SOURCE_ID });
    await vi.waitFor(() =>
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("db is down"),
        expect.objectContaining({ level: "warning" }),
      ),
    );
  });

  // 공백뿐인 응답은 프로바이더의 빈 응답 가드를 통과해 서비스까지 온다
  it("LLM이 공백뿐인 제목을 주면 RPC를 안 부르고 Sentry로 보고한다", async () => {
    const { supabase, rpc } = titleSupabase();

    await createSource({
      supabase,
      providers: titleProviders(async () => "   "),
      body: "아무 글",
      spaceId: EXPLICIT_SPACE,
    });

    await vi.waitFor(() =>
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("blank title"),
        expect.objectContaining({ level: "warning" }),
      ),
    );
    expect(rpcNames(rpc)).not.toContain("fill_source_title");
  });
});

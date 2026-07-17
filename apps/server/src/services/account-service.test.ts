import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

const { getSupabaseAdminMock, rpcSpy, deleteUserSpy } = vi.hoisted(() => {
  const rpcSpy = vi.fn(() => ({ error: null }));
  const deleteUserSpy = vi.fn((): { error: { message: string } | null } => ({
    error: null,
  }));
  return {
    rpcSpy,
    deleteUserSpy,
    getSupabaseAdminMock: vi.fn(() => ({
      rpc: rpcSpy,
      auth: { admin: { deleteUser: deleteUserSpy } },
    })),
  };
});
vi.mock("@server/infra/supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

import {
  computeAccountDeletionPlan,
  deleteAccount,
  getAccountDeletionBlockers,
} from "./account-service";

const ME = "aaaaaaaa-0000-4000-a000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-a000-000000000002";
const THIRD = "cccccccc-0000-4000-a000-000000000003";
const WS_SOLO = "11111111-1111-4111-a111-111111111111";
const WS_SHARED = "22222222-2222-4222-a222-222222222222";

// account-service는 workspace_members를 두 번 조회한다: ① 내 워크스페이스 id,
// ② 그 워크스페이스들의 전체 명단. 응답을 호출 순서대로 돌려주는 stub.
function mockUserSupabase(
  responses: Array<{ data: unknown; error: unknown }>,
): TypedSupabaseClient {
  let call = 0;
  const from = () => {
    const stub: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order"]) {
      stub[method] = () => stub;
    }
    stub["then"] = (resolve: (value: unknown) => void) => {
      const response = responses[call] ?? { data: [], error: null };
      call += 1;
      resolve(response);
    };
    return stub;
  };
  return { from } as unknown as TypedSupabaseClient;
}

const SHARED_ROSTER = [
  { workspace_id: WS_SHARED, user_id: ME, role: "owner" },
  { workspace_id: WS_SHARED, user_id: OTHER, role: "member" },
];

describe("computeAccountDeletionPlan", () => {
  it("유일 멤버 워크스페이스는 teardown 대상", () => {
    const plan = computeAccountDeletionPlan(
      [{ workspace_id: WS_SOLO, user_id: ME, role: "owner" }],
      ME,
    );
    expect(plan).toEqual({
      teardownWorkspaceIds: [WS_SOLO],
      blockingWorkspaceIds: [],
    });
  });

  it("유일 owner인데 다른 멤버가 있으면 차단(이전 필요)", () => {
    const plan = computeAccountDeletionPlan(
      [
        { workspace_id: WS_SHARED, user_id: ME, role: "owner" },
        { workspace_id: WS_SHARED, user_id: OTHER, role: "member" },
      ],
      ME,
    );
    expect(plan).toEqual({
      teardownWorkspaceIds: [],
      blockingWorkspaceIds: [WS_SHARED],
    });
  });

  it("다른 owner가 있으면 차단하지 않는다(공동 owner)", () => {
    const plan = computeAccountDeletionPlan(
      [
        { workspace_id: WS_SHARED, user_id: ME, role: "owner" },
        { workspace_id: WS_SHARED, user_id: OTHER, role: "owner" },
      ],
      ME,
    );
    expect(plan).toEqual({
      teardownWorkspaceIds: [],
      blockingWorkspaceIds: [],
    });
  });

  it("내가 owner가 아니면(비-owner) 다른 멤버가 있어도 조치 없음", () => {
    const plan = computeAccountDeletionPlan(
      [
        { workspace_id: WS_SHARED, user_id: ME, role: "member" },
        { workspace_id: WS_SHARED, user_id: OTHER, role: "owner" },
      ],
      ME,
    );
    expect(plan).toEqual({
      teardownWorkspaceIds: [],
      blockingWorkspaceIds: [],
    });
  });

  it("여러 워크스페이스를 각각 독립 판정한다", () => {
    const plan = computeAccountDeletionPlan(
      [
        { workspace_id: WS_SOLO, user_id: ME, role: "owner" },
        { workspace_id: WS_SHARED, user_id: ME, role: "owner" },
        { workspace_id: WS_SHARED, user_id: OTHER, role: "member" },
        { workspace_id: WS_SHARED, user_id: THIRD, role: "member" },
      ],
      ME,
    );
    expect(plan).toEqual({
      teardownWorkspaceIds: [WS_SOLO],
      blockingWorkspaceIds: [WS_SHARED],
    });
  });
});

describe("getAccountDeletionBlockers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 순수 함수 테스트가 못 잡는 것: 두 번째 "전체 명단" 쿼리를 실제로 던지는지.
  // 이게 회귀해 내 행만으로 판정하면 공유 워크스페이스가 solo로 오분류돼 통째 삭제된다.
  it("전체 명단 쿼리로 공유 워크스페이스를 blocking으로 분류한다", async () => {
    const result = await getAccountDeletionBlockers({
      supabase: mockUserSupabase([
        { data: [{ workspace_id: WS_SHARED }], error: null },
        { data: SHARED_ROSTER, error: null },
      ]),
      userId: ME,
    });
    expect(result).toEqual({ blockingWorkspaceIds: [WS_SHARED] });
  });

  it("멤버인 워크스페이스가 없으면 두 번째 쿼리 없이 빈 결과", async () => {
    const result = await getAccountDeletionBlockers({
      supabase: mockUserSupabase([{ data: [], error: null }]),
      userId: ME,
    });
    expect(result).toEqual({ blockingWorkspaceIds: [] });
  });
});

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocker가 있으면 admin 경로를 한 번도 타지 않고 PRECONDITION_FAILED", async () => {
    await expect(
      deleteAccount({
        supabase: mockUserSupabase([
          { data: [{ workspace_id: WS_SHARED }], error: null },
          { data: SHARED_ROSTER, error: null },
        ]),
        userId: ME,
      }),
    ).rejects.toMatchObject({ name: "SupabaseError", code: "precondition" });

    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(deleteUserSpy).not.toHaveBeenCalled();
  });

  it("deleteUser가 실패하면 SupabaseError(query_failed)로 감싸 던진다", async () => {
    deleteUserSpy.mockReturnValueOnce({
      error: { message: "admin api unavailable" },
    });

    await expect(
      deleteAccount({
        supabase: mockUserSupabase([{ data: [], error: null }]),
        userId: ME,
      }),
    ).rejects.toMatchObject({ name: "SupabaseError", code: "query_failed" });
  });
});

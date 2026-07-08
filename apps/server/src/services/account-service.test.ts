import { describe, expect, it } from "vitest";

import { computeAccountDeletionPlan } from "./account-service";

const ME = "aaaaaaaa-0000-4000-a000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-a000-000000000002";
const THIRD = "cccccccc-0000-4000-a000-000000000003";
const WS_SOLO = "11111111-1111-4111-a111-111111111111";
const WS_SHARED = "22222222-2222-4222-a222-222222222222";

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

import { TRPCError } from "@trpc/server";

import type { WorkspaceRole } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

interface MembershipRow {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
}

interface AccountDeletionPlan {
  // 유일 멤버라 계정과 함께 통째로 완전 삭제할 워크스페이스
  teardownWorkspaceIds: string[];
  // 유일 owner인데 다른 멤버가 있어, 삭제 전 소유권 이전이 필요한 워크스페이스
  blockingWorkspaceIds: string[];
}

// 계정 삭제 시 각 워크스페이스를 어떻게 처리할지 판정한다(07-modeling 동작 규칙).
// rows는 내가 속한 모든 워크스페이스의 "전체" 멤버 명단(각 워크스페이스의 인원·
// owner 수를 세야 하므로 내 행만으로는 부족하다).
export function computeAccountDeletionPlan(
  rows: MembershipRow[],
  selfUserId: string,
): AccountDeletionPlan {
  const byWorkspace = new Map<string, MembershipRow[]>();
  for (const row of rows) {
    const members = byWorkspace.get(row.workspace_id) ?? [];
    members.push(row);
    byWorkspace.set(row.workspace_id, members);
  }

  const teardownWorkspaceIds: string[] = [];
  const blockingWorkspaceIds: string[] = [];

  for (const [workspaceId, members] of byWorkspace) {
    const me = members.find((m) => m.user_id === selfUserId);
    if (!me) {
      continue;
    }

    if (members.length === 1) {
      teardownWorkspaceIds.push(workspaceId);
      continue;
    }

    const iAmSoleOwner =
      me.role === "owner" &&
      !members.some((m) => m.role === "owner" && m.user_id !== selfUserId);
    if (iAmSoleOwner) {
      blockingWorkspaceIds.push(workspaceId);
    }
  }

  return { teardownWorkspaceIds, blockingWorkspaceIds };
}

async function loadDeletionPlan(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<AccountDeletionPlan> {
  const { data: myRows, error: myError } = await supabase
    .from("workspace_members")
    .select("workspace_id");
  throwIfSupabaseError(myError);

  const workspaceIds = (myRows ?? []).map((row) => row.workspace_id);
  if (workspaceIds.length === 0) {
    return { teardownWorkspaceIds: [], blockingWorkspaceIds: [] };
  }

  const { data: allRows, error: allError } = await supabase
    .from("workspace_members")
    .select("workspace_id, user_id, role")
    .in("workspace_id", workspaceIds);
  throwIfSupabaseError(allError);

  return computeAccountDeletionPlan(allRows ?? [], userId);
}

// UI가 삭제 버튼을 열기 전에 물어보는 read — 이전이 필요한 워크스페이스를 알려준다.
export async function getAccountDeletionBlockers(args: {
  supabase: TypedSupabaseClient;
  userId: string;
}): Promise<{ blockingWorkspaceIds: string[] }> {
  const plan = await loadDeletionPlan(args.supabase, args.userId);
  return { blockingWorkspaceIds: plan.blockingWorkspaceIds };
}

// 계정 삭제. 유일 owner인데 다른 멤버가 있으면 막고 소유권 이전을 요구한다.
// 유일-멤버 워크스페이스는 먼저 완전 삭제하고(고아 데이터 방지), 그다음 계정을 지운다.
// teardown과 deleteUser는 Auth API라 한 트랜잭션으로 못 묶는다 — deleteUser가 실패하면
// 이미 지운 워크스페이스는 그대로 두고 던진다(재시도가 수렴한다).
export async function deleteAccount(args: {
  supabase: TypedSupabaseClient;
  admin: TypedSupabaseClient;
  userId: string;
}): Promise<void> {
  const { supabase, admin, userId } = args;

  const plan = await loadDeletionPlan(supabase, userId);

  if (plan.blockingWorkspaceIds.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Transfer workspace ownership before deleting your account.",
    });
  }

  for (const workspaceId of plan.teardownWorkspaceIds) {
    const { error } = await admin.rpc("delete_workspace", {
      p_workspace_id: workspaceId,
    });
    throwIfSupabaseError(error);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to delete account.",
      cause: error,
    });
  }
}

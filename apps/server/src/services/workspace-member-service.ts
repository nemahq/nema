import type { WorkspaceMember, WorkspaceRole } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 격리는 RLS(workspace_members_member_select)가 담당한다 — 내가 속한 워크스페이스의
// 멤버만 보인다. 사람 식별(이메일·이름)은 auth.users라 UI 단계에서 붙인다.
export async function listWorkspaceMembers(args: {
  supabase: TypedSupabaseClient;
  workspaceId: string;
}): Promise<{ members: WorkspaceMember[] }> {
  const { data, error } = await args.supabase
    .from("workspace_members")
    .select("workspace_id, user_id, role, created_at")
    .eq("workspace_id", args.workspaceId)
    .order("created_at", { ascending: true });
  throwIfSupabaseError(error);

  return {
    members: (data ?? []).map((row) => ({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
    })),
  };
}

// 소유권 이전 = 다른 멤버를 owner로 승격. 마지막 owner 강등은 DB 트리거가 막는다.
export async function updateWorkspaceMemberRole(args: {
  supabase: TypedSupabaseClient;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}): Promise<void> {
  const { error } = await args.supabase.rpc("update_workspace_member_role", {
    p_workspace_id: args.workspaceId,
    p_user_id: args.userId,
    p_role: args.role,
  });
  throwIfSupabaseError(error);
}

// 마지막 owner의 이탈은 트리거가 막아 "먼저 소유권을 넘겨라"를 강제한다.
export async function leaveWorkspace(args: {
  supabase: TypedSupabaseClient;
  workspaceId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("leave_workspace", {
    p_workspace_id: args.workspaceId,
  });
  throwIfSupabaseError(error);
}

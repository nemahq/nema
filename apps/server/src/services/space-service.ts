import type { Space } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 격리는 RLS(spaces_member_select)가 담당한다.
export async function listSpaces(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ spaces: Space[] }> {
  const { data, error } = await args.supabase
    .from("spaces")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });
  throwIfSupabaseError(error);

  return {
    spaces: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    })),
  };
}

export async function createSpace(args: {
  supabase: TypedSupabaseClient;
  name: string;
}): Promise<{ spaceId: string }> {
  // 1인 단계: 가입 트리거가 만든 개인 Workspace 1개 (RLS로 내 멤버십만 보임).
  // 멀티 Workspace가 열리면 입력으로 받는다 — createTag·createSource와 같은 방식.
  const { data: memberships, error: memberError } = await args.supabase
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", { ascending: true })
    .limit(1);
  throwIfSupabaseError(memberError);

  // 0건은 가입 트리거 불변식이 깨졌다는 뜻이라 bootstrapWorkspace와 같은 이유로
  // SupabaseError(EXPECTED_DOMAIN_CODES에 걸려 캡처 스킵)가 아닌 일반 Error로 던진다.
  const membership = memberships?.[0];
  if (!membership) {
    throw new Error(
      "Caller has no workspace membership — signup trigger invariant broken",
    );
  }

  const { data: spaceId, error } = await args.supabase.rpc("create_space", {
    p_workspace_id: membership.workspace_id,
    p_name: args.name,
  });
  throwIfSupabaseError(error);

  return { spaceId };
}

export async function renameSpace(args: {
  supabase: TypedSupabaseClient;
  spaceId: string;
  name: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("rename_space", {
    p_space_id: args.spaceId,
    p_name: args.name,
  });
  throwIfSupabaseError(error);
}

export async function deleteSpace(args: {
  supabase: TypedSupabaseClient;
  spaceId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("delete_space", {
    p_space_id: args.spaceId,
  });
  throwIfSupabaseError(error);
}

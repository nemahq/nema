import type { User } from "@supabase/supabase-js";

import type { WorkspaceBootstrap } from "@nema-io/shared";
import { type BootstrapUser, DEFAULT_SPACE_NAME } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// apps/web/src/lib/auth의 AppUser 표시 이름 도출과 같은 우선순위(구글은 given_name/
// full_name을 채우고, 매직링크는 이메일만 있음) — 서버가 이 값을 계약으로 내려주므로
// FE·MCP 등 다른 소비자도 이름 도출 로직을 각자 다시 구현하지 않아도 된다.
const NAME_PRIORITY: Array<(u: User) => unknown> = [
  (u) => u.user_metadata?.["given_name"],
  (u) => u.user_metadata?.["full_name"],
  (u) => u.email,
];

export function toBootstrapUser(user: User): BootstrapUser {
  let name = "";
  for (const resolve of NAME_PRIORITY) {
    const resolved = resolve(user);
    if (typeof resolved === "string" && resolved) {
      name = resolved;
      break;
    }
  }

  const rawAvatar = user.user_metadata?.["avatar_url"];

  return {
    id: user.id,
    name: name || user.id,
    email: user.email ?? "",
    ...(typeof rawAvatar === "string" && rawAvatar
      ? { avatarUrl: rawAvatar }
      : {}),
  };
}

// 워크스페이스 이름 정책은 아직 미정(07-modeling.md "열어두는 것") — 개인 단계
// 표시용 자리만 채운다. Space와 달리 FE 계약에 없어 shared 상수로 안 뺐다.
const DEFAULT_WORKSPACE_NAME = "Workspace";

// 신규 유저 랜딩 진입점. MVP는 워크스페이스 단수 전제라 가장 오래된 멤버십(=가입
// 트리거가 만든 것) 하나만 본다 — source-service의 "가장 오래된 Space = 개인 칸"과
// 같은 판단. Space는 가입 트리거가 이미 만들어두므로 여기서 만들지 않고, 대신
// mark_first_entry()로 "이 유저의 첫 진입"만 원자적으로 표시해 라우팅 신호로 쓴다.
export async function bootstrapWorkspace(args: {
  supabase: TypedSupabaseClient;
  user: User;
}): Promise<WorkspaceBootstrap> {
  const { supabase, user } = args;

  const { data: isFirstEntry, error: firstEntryError } =
    await supabase.rpc("mark_first_entry");
  throwIfSupabaseError(firstEntryError);

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name)")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  throwIfSupabaseError(membershipError);

  const { data: spaceRows, error: spacesError } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("workspace_id", membership.workspace_id)
    .order("created_at", { ascending: true });
  throwIfSupabaseError(spacesError);

  return {
    user: toBootstrapUser(user),
    workspace: {
      id: membership.workspaces.id,
      name: membership.workspaces.name ?? DEFAULT_WORKSPACE_NAME,
    },
    spaces: (spaceRows ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? DEFAULT_SPACE_NAME,
    })),
    isFirstEntry: Boolean(isFirstEntry),
  };
}

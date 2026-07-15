import { customAlphabet } from "nanoid";

import {
  type Space,
  SPACE_PUBLIC_ID_ALPHABET,
  SPACE_PUBLIC_ID_LENGTH,
  SPACE_PUBLIC_ID_PREFIX,
} from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// CSPRNG(nanoid) — DB 쪽 generate_space_public_id()는 트리거 안이라 앱 레이어를
// 못 타서 Postgres random()(비CSPRNG)을 쓴다. public_id는 RLS로 보호되는 목록
// 매칭용일 뿐 인증 토큰이 아니라 두 등급이 섞여도 안전하다.
const generateSpacePublicIdSuffix = customAlphabet(
  SPACE_PUBLIC_ID_ALPHABET,
  SPACE_PUBLIC_ID_LENGTH,
);

// 격리는 RLS(spaces_member_select)가 담당한다.
export async function listSpaces(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ spaces: Space[] }> {
  const { data, error } = await args.supabase
    .from("spaces")
    .select("id, public_id, name, created_at")
    .order("created_at", { ascending: true });
  throwIfSupabaseError(error);

  return {
    spaces: (data ?? []).map((row) => ({
      id: row.id,
      publicId: row.public_id,
      name: row.name,
      createdAt: row.created_at,
    })),
  };
}

export async function createSpace(args: {
  supabase: TypedSupabaseClient;
  name: string;
}): Promise<{ spaceId: string; publicId: string }> {
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

  const publicId = SPACE_PUBLIC_ID_PREFIX + generateSpacePublicIdSuffix();

  const { data: spaceId, error } = await args.supabase.rpc("create_space", {
    p_workspace_id: membership.workspace_id,
    p_name: args.name,
    p_public_id: publicId,
  });
  throwIfSupabaseError(error);

  return { spaceId, publicId };
}

export async function updateSpace(args: {
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
  targetSpaceId?: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("delete_space", {
    p_space_id: args.spaceId,
    p_target_space_id: args.targetSpaceId,
  });
  throwIfSupabaseError(error);
}

// source.listPending은 워크스페이스 전체를 최근 PENDING_SOURCE_LIST_LIMIT개로
// 자르므로 특정 Space의 정확한 개수 판정엔 못 쓴다 — Space 삭제 확인 UI가
// "몇 개나 옮겨지는지" 정확히 알아야 해서 별도 카운트 RPC를 부른다.
export async function countPendingDrafts(args: {
  supabase: TypedSupabaseClient;
  spaceId: string;
}): Promise<number> {
  const { data, error } = await args.supabase.rpc("count_pending_drafts", {
    p_space_id: args.spaceId,
  });
  throwIfSupabaseError(error);

  return data;
}

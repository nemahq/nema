import type { Tag, TagListScope } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 격리는 RLS(tags_member_select)가 담당한다.
export async function listTags(args: {
  supabase: TypedSupabaseClient;
  scope: TagListScope;
}): Promise<{ tags: Tag[] }> {
  let query = args.supabase
    .from("tags")
    .select("id, title, description, status, created_at")
    .order("title", { ascending: true });

  if (args.scope !== "all") {
    query = query.eq("status", args.scope);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error);

  return {
    tags: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
}

export async function createTag(args: {
  supabase: TypedSupabaseClient;
  title: string;
  description: string;
}): Promise<{ tagId: string }> {
  // 1인 단계: 가입 트리거가 만든 개인 Workspace 1개 (RLS로 내 멤버십만 보임).
  // 멀티 Workspace가 열리면 입력으로 받는다 — 그때까진 가장 오래된 게 개인 칸
  // (createSource가 개인 Space를 고르는 것과 같은 방식).
  const { data: membership, error: memberError } = await args.supabase
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  throwIfSupabaseError(memberError);

  const { data: tagId, error } = await args.supabase.rpc("create_tag", {
    p_workspace_id: membership.workspace_id,
    p_title: args.title,
    p_description: args.description,
  });
  throwIfSupabaseError(error);

  return { tagId };
}

export async function updateTag(args: {
  supabase: TypedSupabaseClient;
  id: string;
  title: string;
  description: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("update_tag", {
    p_tag_id: args.id,
    p_title: args.title,
    p_description: args.description,
  });
  throwIfSupabaseError(error);
}

export async function archiveTag(args: {
  supabase: TypedSupabaseClient;
  id: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("archive_tag", {
    p_tag_id: args.id,
  });
  throwIfSupabaseError(error);
}

export async function restoreTag(args: {
  supabase: TypedSupabaseClient;
  id: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("restore_tag", {
    p_tag_id: args.id,
  });
  throwIfSupabaseError(error);
}

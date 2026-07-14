import type { Topic } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 격리는 RLS(topics_member_select)가 담당한다 — spaceId를 안 주면 소속된 모든
// Space를 가로질러 반환한다(Topic 관리 화면). scope 필터(active만)가 없는 이유는
// Tag의 list와 달리 여전하다 — 스레드 피드의 Topic 필터는 archived도 계속 선택
// 가능해야 하므로(재사용 제안 후보에서만 제외) status를 항상 함께 반환한다. spaceId를
// 주면 그 Space로 좁힌다 — Digest 리뷰의 "기존 Topic 검색"처럼 다른 Space의 동명
// Topic이 "기존"으로 잘못 노출되면 안 되는 화면이 쓴다.
export async function listTopics(args: {
  supabase: TypedSupabaseClient;
  spaceId?: string;
}): Promise<{ topics: Topic[] }> {
  let query = args.supabase
    .from("topics")
    .select("id, name, status")
    .order("name", { ascending: true });

  if (args.spaceId !== undefined) {
    query = query.eq("space_id", args.spaceId);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error);

  return {
    topics: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
    })),
  };
}

export async function updateTopic(args: {
  supabase: TypedSupabaseClient;
  id: string;
  name: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("update_topic", {
    p_topic_id: args.id,
    p_name: args.name,
  });
  throwIfSupabaseError(error);
}

export async function archiveTopic(args: {
  supabase: TypedSupabaseClient;
  id: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("archive_topic", {
    p_topic_id: args.id,
  });
  throwIfSupabaseError(error);
}

export async function restoreTopic(args: {
  supabase: TypedSupabaseClient;
  id: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("restore_topic", {
    p_topic_id: args.id,
  });
  throwIfSupabaseError(error);
}

import type { Topic } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 격리는 RLS(topics_member_select)가 담당한다.
// Tag의 list와 달리 scope 필터가 없다 — 스레드 피드의 Topic 필터는 archived도
// 계속 선택 가능해야 하므로(재사용 제안 후보에서만 제외) status를 항상 함께 반환한다.
export async function listTopics(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ topics: Topic[] }> {
  const { data, error } = await args.supabase
    .from("topics")
    .select("id, name, status")
    .order("name", { ascending: true });
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

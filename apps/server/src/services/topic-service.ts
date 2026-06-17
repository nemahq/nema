import type { Topic } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 주제 레지스트리 읽기 — 격리는 RLS(topics_member_select)가 담당한다.
// MCP·앱 어시스턴트가 새 글의 주제를 제안할 때 기존 라벨을 재사용하려고 먼저 읽는다.
export async function listTopics(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ topics: Topic[] }> {
  const { data, error } = await args.supabase
    .from("topics")
    .select("id, name")
    .order("name", { ascending: true });
  throwIfSupabaseError(error);

  return {
    topics: (data ?? []).map((row) => ({ id: row.id, name: row.name })),
  };
}

// 어시스턴트 프롬프트에 넣을 기존 주제 이름 목록(재사용 유도).
export async function listTopicNames(
  supabase: TypedSupabaseClient,
): Promise<string[]> {
  const { topics } = await listTopics({ supabase });
  return topics.map((topic) => topic.name);
}

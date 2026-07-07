import type { Topic } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 격리는 RLS(topics_member_select)가 담당한다.
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

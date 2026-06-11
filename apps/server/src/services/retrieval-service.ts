import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// createRetrieval은 v1 검색 파이프와 함께 철거 — 메시지 삭제 시 정리 경로만 남긴다
export async function deleteRetrieval({
  supabase,
  retrievalId,
}: {
  supabase: TypedSupabaseClient;
  retrievalId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("session_retrievals")
    .delete()
    .eq("id", retrievalId);

  throwIfSupabaseError(error);
}

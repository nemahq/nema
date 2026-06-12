import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 박제까지만 동기 — 추출·임베딩은 statement-sync 워커가 이어받는다.
// 응답은 source_id 하나. 화면은 이 id로 처리 상태를 추적한다 (ingestion-design 2장).
export async function createSource(args: {
  supabase: TypedSupabaseClient;
  body: string;
  sessionId?: string;
}): Promise<{ sourceId: string }> {
  const { supabase, body, sessionId } = args;

  // 1인 단계: 가입 트리거가 만든 개인 Space 1개 (RLS로 내 멤버십만 보임).
  // 멀티 Space가 열리면 입력으로 받는다 — 그때까지 가장 오래된 Space가 개인 칸.
  const { data: membership, error: memberError } = await supabase
    .from("space_members")
    .select("space_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  throwIfSupabaseError(memberError);

  const { data: sourceId, error } = await supabase.rpc("create_source", {
    p_space_id: membership.space_id,
    p_body: body,
    ...(sessionId !== undefined && { p_session_id: sessionId }),
  });
  throwIfSupabaseError(error);

  return { sourceId };
}

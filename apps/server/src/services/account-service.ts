import { getSupabaseAdmin } from "@server/infra/supabase/supabase";
import { SupabaseError } from "@server/infra/supabase/supabase-error";

// legacy는 "다른 멤버가 있는 워크스페이스의 유일 소유자면 삭제를 막는다" 분기가
// 있었지만, 이 세대 스키마엔 워크스페이스가 없어 그 상태 자체가 안 생긴다 — 그
// 분기를 걷어냈다. auth.users를 지우면 sources → digests가 ON DELETE CASCADE로
// 함께 지워진다. Qdrant의 다이제스트 벡터는 CASCADE 대상이 아니라 여기선 안
// 지워진다 — 색인 정리는 이번 슬라이스 밖(하지 말 것 참고).
export async function deleteAccount(args: { userId: string }): Promise<void> {
  const { userId } = args;

  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
  if (error) {
    throw new SupabaseError(error.message, error.code ?? "unknown");
  }
}

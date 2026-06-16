import { trpc } from "@web/lib/trpc";

// 배치 실패는 검토함 카드가 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
export function useRejectPendingRelation() {
  return trpc.changeset.rejectPendingRelation.useMutation({
    meta: { skipGlobalToast: true },
  });
}

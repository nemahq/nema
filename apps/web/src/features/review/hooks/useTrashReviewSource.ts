import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// "원본도 삭제하기" — 기존 trash_source(소프트 삭제) RPC를 그대로 재사용한다.
// 실패는 Changeset 상세 화면이 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
export function useTrashReviewSource() {
  const utils = trpc.useUtils();
  return useMutation(trpc.source.delete, {
    meta: { skipGlobalToast: true },
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.changeset.listChangesets.invalidate();
    },
  });
}

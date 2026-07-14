import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 실패는 Changeset 상세 화면이 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
export function useRestoreReview() {
  const utils = trpc.useUtils();
  return useMutation(trpc.digestReview.restore, {
    meta: { skipGlobalToast: true },
    onSuccess: () => utils.changeset.listChangesets.invalidate(),
  });
}

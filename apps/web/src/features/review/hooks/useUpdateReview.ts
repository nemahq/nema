import { trpc } from "@web/lib/trpc";

// 실패는 Digest 리뷰 화면이 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
export function useUpdateReview(spaceId: string, number: number) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
    meta: { skipGlobalToast: true },
    onSuccess: () => {
      utils.digestReview.get.invalidate({ spaceId, number });
      utils.source.listPending.invalidate();
    },
  });
}

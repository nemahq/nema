import { trpc } from "@web/lib/trpc";

// 초안 편집 — 저장 후 그 리뷰 상세와 대기 원본 목록(digest 개수)을 갱신한다.
export function useUpdateReview(changesetId: string) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
    onSuccess: () => {
      utils.digestReview.get.invalidate({ changesetId });
      utils.source.listPending.invalidate();
    },
  });
}

import { trpc } from "@web/lib/trpc";

// 초안 편집 — 저장 후 그 리뷰 상세와 대기 원문 목록(digest 개수)을 갱신한다.
export function useUpdateReview(spaceId: string, number: number) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
    onSuccess: () => {
      utils.digestReview.get.invalidate({ spaceId, number });
      utils.source.listPending.invalidate();
    },
  });
}

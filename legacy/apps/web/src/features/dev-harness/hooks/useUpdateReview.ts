import { trpc } from "@web/lib/trpc";

// 초안 편집 — 저장 후 그 리뷰 상세와 대기 원문 목록(digest 개수)을 갱신한다.
export function useUpdateReview(spaceId: string, number: number) {
  const utils = trpc.useUtils();
  return trpc.digestReview.update.useMutation({
    onSuccess: (data) => {
      // invalidate() 재조회를 기다리지 않고 응답의 draftVersion을 캐시에 바로
      // 반영한다 — apps/web/src/features/review/hooks/useUpdateReview.ts와 같은 이유
      // (곧장 재시도하면 옛 버전으로 NM012 오탐).
      utils.digestReview.get.setData({ spaceId, number }, (current) =>
        current ? { ...current, draftVersion: data.draftVersion } : current,
      );
      utils.digestReview.get.invalidate({ spaceId, number });
      utils.source.listPending.invalidate();
    },
  });
}

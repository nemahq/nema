import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// 실패는 Digest 리뷰 화면이 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
// changeset.getByNumber를 무효화하는 이유: Open/Closed가 URL을 공유해서(변경사항
// 상세 게이트), 확정 성공 후 이 쿼리가 새 status(applied)로 다시 읽히기만 하면
// 같은 URL이 자연히 ClosedReviewScreen으로 넘어간다 — 별도 navigate가 필요 없다.
export function useConfirmReview(spaceId: string, number: number) {
  const utils = trpc.useUtils();
  return useMutation(trpc.digestReview.confirm, {
    meta: { skipGlobalToast: true },
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.source.list.invalidate();
      utils.changeset.listChangesets.invalidate();
      utils.changeset.getByNumber.invalidate({ spaceId, number });
    },
  });
}

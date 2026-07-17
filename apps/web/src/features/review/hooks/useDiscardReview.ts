import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// digestReview.get은 여기서 invalidate하지 않는다 — 그 RPC 가드가 status='pending'만
// 허용해서, 버려진 뒤 재조회하면 에러가 난다. 성공하면 OpenReviewScreen이 이 changeset을
// 다시 그리지 않고 ClosedReviewScreen으로 바로 이동하므로 재조회 자체가 필요 없다.
export function useDiscardReview() {
  const utils = trpc.useUtils();
  return useMutation(trpc.digestReview.discard, {
    meta: { skipGlobalToast: true },
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.changeset.listChangesets.invalidate();
    },
  });
}

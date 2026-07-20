import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// digestReview.get은 여기서 invalidate하지 않는다 — 그 RPC 가드가 status='pending'만
// 허용해서, 버려진 뒤 재조회하면 에러가 난다. 대신 changeset.getByNumber를 무효화한다 —
// 모든 상태가 URL을 공유해서(changesetDetailRegistry), 이 쿼리가 새 status(rejected)로
// 다시 읽히기만 하면 같은 URL이 자연히 ChangesetRecordScreen으로 넘어간다.
export function useDiscardReview(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.digestReview.discard, {
    meta: { skipGlobalToast: true },
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.changeset.listChangesets.invalidate();
      utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}

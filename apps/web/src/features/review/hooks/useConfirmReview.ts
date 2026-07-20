import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// 실패는 Digest 리뷰 화면이 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
// changeset.getByNumber를 무효화하는 이유: Open/Closed가 URL을 공유해서(변경사항
// 상세 게이트), 확정 성공 후 이 쿼리가 새 status(applied)로 다시 읽히기만 하면
// 같은 URL이 자연히 ClosedReviewScreen으로 넘어간다 — 별도 navigate가 필요 없다.
// 이 invalidate 자체가 실패하면(네트워크 등) 확정은 이미 성공했는데 화면만 Open에
// 멈춰 있게 되므로, 그 경우만 별도로 알린다.
export function useConfirmReview(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.digestReview.confirm, {
    meta: { skipGlobalToast: true },
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.source.list.invalidate();
      utils.changeset.listChangesets.invalidate();
      utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}

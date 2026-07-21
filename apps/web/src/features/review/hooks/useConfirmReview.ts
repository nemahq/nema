import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// 실패는 Digest 리뷰 화면이 인라인으로 표면화한다 — 전역 토스트는 중복이라 끈다.
// changeset.getByNumber만 반환(await)해서 화면 전환을 만드는 이 재조회가 끝날 때까지
// mutation을 pending 상태로 붙든다 — 모든 상태가 URL을 공유해서(changesetDetailRegistry),
// 이 쿼리가 새 status(applied)로 다시 읽혀야 같은 URL이 ChangesetRecordScreen으로
// 넘어간다. 나머지 invalidate는 이 화면 전환과 무관해 fire-and-forget으로 둔다.
// getByNumber 자체가 실패하면(네트워크 등) 확정은 이미 성공했는데 화면만 편집 상태에
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
      return utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}

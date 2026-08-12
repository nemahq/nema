import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// getPendingRelationByNumber는 여기서 invalidate하지 않는다 — useResolveConflictRelation.ts
// 주석 참고(그 쿼리 가드가 status='open'만 허용해서 성공 직후 재조회하면 렌더로
// 에러가 던져진다).
export function useRejectPendingRelation(
  spaceId: string,
  changesetNumber: number,
) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.changeset.rejectPendingRelation, {
    onSuccess: () => {
      utils.changeset.listChangesets.invalidate();
      return utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}

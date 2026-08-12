import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// useResolveConflictRelation.ts와 같은 화면 전환·invalidate 패턴 — getPendingRelationByNumber는
// 여기서도 invalidate하지 않는다(같은 이유, 그 쿼리 가드가 status='open'만 허용).
export function useResolveDuplicateRelation(
  spaceId: string,
  changesetNumber: number,
) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.changeset.resolveDuplicateRelation, {
    onSuccess: () => {
      utils.changeset.listChangesets.invalidate();
      return utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}

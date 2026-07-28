import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// useConfirmReview와 같은 화면 전환 패턴 — changeset.getByNumber만 반환(await)해서
// 이 재조회가 새 status(closed)+outcome(applied)로 끝날 때까지 mutation을 pending
// 상태로 붙든다(changesetDetailRegistry가 그 값으로 ChangesetRecordScreen을 고른다).
// getPendingRelationByNumber는 화면 전환과 무관해 fire-and-forget으로 정리만 한다.
export function useResolveConflictRelation(
  spaceId: string,
  changesetNumber: number,
) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.changeset.resolveConflictRelation, {
    onSuccess: () => {
      utils.changeset.listChangesets.invalidate();
      utils.changeset.getPendingRelationByNumber.invalidate({
        spaceId,
        number: changesetNumber,
      });
      return utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}

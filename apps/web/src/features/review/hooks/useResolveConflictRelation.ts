import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// useConfirmReview와 같은 화면 전환 패턴 — changeset.getByNumber만 반환(await)해서
// 이 재조회가 새 status(closed)+outcome(applied)로 끝날 때까지 mutation을 pending
// 상태로 붙든다(changesetDetailRegistry가 그 값으로 ChangesetRecordScreen을 고른다).
// getPendingRelationByNumber는 여기서 invalidate하지 않는다 — 그 쿼리 가드가
// status='open'만 허용해서, 성공 직후(closed로 바뀐 뒤) 재조회하면 아직 마운트돼
// 있는 RelationJudgmentContent가 그 에러를 렌더로 던진다(useDiscardReview.ts의
// digestReview.get 안 건드리는 이유와 같다).
export function useResolveConflictRelation(
  spaceId: string,
  changesetNumber: number,
) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.changeset.resolveConflictRelation, {
    onSuccess: () => {
      utils.changeset.listChangesets.invalidate();
      return utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}

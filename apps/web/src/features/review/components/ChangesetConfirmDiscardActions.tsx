import { Button } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface ChangesetConfirmDiscardActionsProps {
  onDiscard: () => void;
  onConfirm: () => void;
  discardPending: boolean;
  confirmPending: boolean;
  discardDisabled: boolean;
  confirmDisabled: boolean;
}

// IngestionScreen·RelationJudgmentScreen이 공유하는 [버리기][확정] 액션 쌍 —
// 둘 다 "판정 대기 changeset을 처리한다"는 같은 헤더 액션 모양이라 화면마다
// 따로 둘 이유가 없다.
export function ChangesetConfirmDiscardActions({
  onDiscard,
  onConfirm,
  discardPending,
  confirmPending,
  discardDisabled,
  confirmDisabled,
}: ChangesetConfirmDiscardActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="neutral" onClick={onDiscard} disabled={discardDisabled}>
        {discardPending
          ? t("review.discard_action_pending")
          : t("review.discard_action")}
      </Button>
      <Button onClick={onConfirm} disabled={confirmDisabled}>
        {confirmPending
          ? t("review.confirm_action_pending")
          : t("review.confirm_action")}
      </Button>
    </div>
  );
}

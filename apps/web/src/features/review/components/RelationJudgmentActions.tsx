import { Button } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface RelationJudgmentActionsProps {
  onDiscard: () => void;
  onConfirm: () => void;
  discardPending: boolean;
  discardDisabled: boolean;
  confirmDisabled: boolean;
}

export function RelationJudgmentActions({
  onDiscard,
  onConfirm,
  discardPending,
  discardDisabled,
  confirmDisabled,
}: RelationJudgmentActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="neutral" onClick={onDiscard} disabled={discardDisabled}>
        {discardPending ? t("common.saving") : t("review.discard_action")}
      </Button>
      <Button onClick={onConfirm} disabled={confirmDisabled}>
        {t("review.confirm_action")}
      </Button>
    </div>
  );
}

import { Button } from "@nema-io/weave";
import { Lock, X } from "@nema-io/weave/icons";

import { useCancelSource } from "@web/features/intake/hooks/useCancelSource";
import { useTranslation } from "@web/lib/tolgee";

interface DraftProcessingActionsProps {
  sourceId: string;
}

export function DraftProcessingActions({
  sourceId,
}: DraftProcessingActionsProps) {
  const { t } = useTranslation();
  const cancelMutation = useCancelSource();

  function handleCancel() {
    cancelMutation.mutate({ sourceId });
  }

  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <p className="flex items-center gap-1 text-xs text-fg-tertiary">
        <Lock className="size-3" />
        {t("intake.draft_locked_reason")}
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleCancel}
        disabled={cancelMutation.isPending}
      >
        <X />
        {t("common.cancel")}
      </Button>
    </div>
  );
}

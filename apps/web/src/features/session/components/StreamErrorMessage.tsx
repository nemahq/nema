import { Button } from "@nema-io/weave";
import { RotateCcw, X } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface StreamErrorMessageProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function StreamErrorMessage({
  message,
  onRetry,
  onDismiss,
}: StreamErrorMessageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-raised px-3 py-2 mt-4">
      <p className="min-w-0 flex-1 text-sm text-fg-secondary">{message}</p>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="xs" onClick={onRetry}>
          <RotateCcw className="size-3" />
          {t("common.retry")}
        </Button>
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}

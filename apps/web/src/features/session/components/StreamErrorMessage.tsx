import { Button } from "@nema-io/weave";
import { RotateCcw, X } from "@nema-io/weave/icons";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useTranslation } from "@web/lib/tolgee";

export function StreamErrorMessage() {
  const { t } = useTranslation();
  const { streamError, retryStream, dismissStreamError } = useChatLifecycle();

  if (!streamError) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center gap-2 rounded-md bg-surface-raised px-3 py-2">
      <p className="min-w-0 flex-1 text-sm text-fg-secondary">{streamError}</p>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="xs" onClick={retryStream}>
          <RotateCcw className="size-3" />
          {t("common.retry")}
        </Button>
        <Button variant="ghost" size="xs" onClick={dismissStreamError}>
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}

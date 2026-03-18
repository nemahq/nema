import type { SaveJobStatus } from "@nema-io/shared";
import { Button } from "@nema-io/weave";
import { AlertCircle, Loader2, RotateCcw } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface SaveQueueItemProps {
  jobId: string;
  status: SaveJobStatus;
  snippet: string | null;
  onRetry: (jobId: string) => void;
}

export function SaveQueueItem({
  jobId,
  status,
  snippet,
  onRetry,
}: SaveQueueItemProps) {
  const { t } = useTranslation();
  const isFailed = status === "failed";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      {isFailed ? (
        <AlertCircle className="size-3.5 shrink-0 text-status-error" />
      ) : (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-fg-tertiary" />
      )}

      <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
        {snippet ?? t("session.save_queue_saving")}
      </span>

      {isFailed && (
        <Button variant="ghost" size="xs" onClick={() => onRetry(jobId)}>
          <RotateCcw className="size-3" />
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

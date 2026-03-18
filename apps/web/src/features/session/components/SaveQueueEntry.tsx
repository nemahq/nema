import type { SaveJobStatus } from "@nema-io/shared";
import { Button, cn } from "@nema-io/weave";
import { AlertCircle, Check, Loader2 } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface SaveQueueEntryProps {
  jobId: string;
  status: SaveJobStatus;
  onRetry: (jobId: string) => void;
}

export function SaveQueueEntry({
  jobId,
  status,
  onRetry,
}: SaveQueueEntryProps) {
  const { t } = useTranslation();
  const isActive = status === "pending" || status === "processing";
  const isFailed = status === "failed";
  const isCompleted = status === "completed";

  return (
    <div className="flex w-full items-center gap-2 rounded-lg bg-surface-card px-3 py-2.5 shadow-lg">
      {isActive && (
        <Loader2 className="size-4 shrink-0 animate-spin text-fg-tertiary" />
      )}
      {isCompleted && <Check className="size-4 shrink-0 text-status-success" />}
      {isFailed && (
        <AlertCircle className="size-4 shrink-0 text-status-error" />
      )}

      <span className="flex-1 text-sm">
        {isActive && t("session.save_queue_saving")}
        {isCompleted && t("session.save_queue_completed")}
        {isFailed && t("session.save_queue_failed")}
      </span>

      <Button
        variant="ghost"
        size="xs"
        className={cn(!isFailed && "invisible")}
        onClick={() => onRetry(jobId)}
      >
        {t("common.retry")}
      </Button>
    </div>
  );
}

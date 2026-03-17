import type { SaveJobStatus } from "@nema-io/shared";
import { Button, cn } from "@nema-io/weave";
import { AlertCircle, Check, Loader2, X } from "@nema-io/weave/icons";

import { useRetrySave } from "@web/features/session/hooks/useRetrySave";
import { useTranslation } from "@web/lib/tolgee";

interface SaveQueueEntryProps {
  jobId: string;
  status: SaveJobStatus;
  onDismiss: (jobId: string) => void;
}

export function SaveQueueEntry({
  jobId,
  status,
  onDismiss,
}: SaveQueueEntryProps) {
  const { t } = useTranslation();
  const retrySave = useRetrySave();
  const isActive = status === "pending" || status === "processing";
  const isFailed = status === "failed";
  const isCompleted = status === "completed";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-md",
        isCompleted && "animate-fade-out",
      )}
    >
      {isActive && (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      )}
      {isCompleted && <Check className="size-4 shrink-0 text-emerald-500" />}
      {isFailed && <AlertCircle className="size-4 shrink-0 text-destructive" />}

      <span className="flex-1 text-sm">
        {isActive && t("session.save_queue_saving")}
        {isCompleted && t("session.save_queue_completed")}
        {isFailed && t("session.save_queue_failed")}
      </span>

      {isFailed && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => retrySave.mutate({ jobId })}
          disabled={retrySave.isPending}
        >
          {t("common.retry")}
        </Button>
      )}

      {isFailed && (
        <button
          type="button"
          aria-label={t("common.close")}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onDismiss(jobId)}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

import { AlertTriangle, Check } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

export type HistoryStatus = "processing" | "completed" | "failed";

interface HistoryStatusIconProps {
  status: HistoryStatus;
}

export function HistoryStatusIcon({ status }: HistoryStatusIconProps) {
  const { t } = useTranslation();

  if (status === "processing") {
    return (
      <span
        aria-label={t("memory.history_status_processing")}
        className="flex size-3 shrink-0 items-center justify-center"
      >
        <span className="block size-1.5 animate-pulse rounded-full bg-fg-secondary" />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        aria-label={t("memory.history_status_failed")}
        className="shrink-0 text-status-error"
      >
        <AlertTriangle className="size-3" strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span
      aria-label={t("memory.history_status_completed")}
      className="shrink-0 text-brand"
    >
      <Check className="size-3" strokeWidth={2.5} />
    </span>
  );
}

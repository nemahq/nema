import { useMemo, useState } from "react";

import { cn } from "@nema-io/weave";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "@nema-io/weave/icons";

import { useSaveQueue } from "@web/features/session/contexts/SaveQueueContext";
import { useTranslation } from "@web/lib/tolgee";

import { SaveQueueItem } from "./SaveQueueItem";

type PanelStatus = "active" | "completed" | "failed";

function derivePanelStatus(items: { status: string }[]): PanelStatus {
  const hasActive = items.some(
    (i) => i.status === "pending" || i.status === "processing",
  );
  if (hasActive) {
    return "active";
  }

  const hasFailed = items.some((i) => i.status === "failed");
  if (hasFailed) {
    return "failed";
  }

  return "completed";
}

export function SaveQueuePanel() {
  const { t } = useTranslation();
  const { items, retry } = useSaveQueue();
  const [expanded, setExpanded] = useState(false);
  const [prevPanelStatus, setPrevPanelStatus] = useState<PanelStatus | null>(
    null,
  );

  const panelStatus = derivePanelStatus(items);

  if (panelStatus !== prevPanelStatus) {
    setPrevPanelStatus(panelStatus);
    if (panelStatus === "failed") {
      setExpanded(true);
    }
  }

  const completedCount = items.filter((i) => i.status === "completed").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const totalCount = items.length;

  const visibleItems = useMemo(
    () =>
      panelStatus === "failed"
        ? items.filter((i) => i.status === "failed")
        : items,
    [items, panelStatus],
  );

  if (items.length === 0) {
    return null;
  }

  function getHeaderText(): string {
    if (panelStatus === "completed") {
      return t("session.save_queue_panel_completed");
    }
    if (panelStatus === "failed") {
      if (completedCount > 0) {
        return t("session.save_queue_panel_partial_fail", {
          completed: completedCount,
          failed: failedCount,
        });
      }
      return t("session.save_queue_panel_all_failed", {
        count: failedCount,
      });
    }
    return t("session.save_queue_panel_active", {
      completed: completedCount,
      total: totalCount,
    });
  }

  function getHeaderIcon() {
    if (panelStatus === "completed") {
      return <Check className="size-4 text-status-success" />;
    }
    if (panelStatus === "failed") {
      return <AlertCircle className="size-4 text-status-error" />;
    }
    return <Loader2 className="size-4 animate-spin text-fg-tertiary" />;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 overflow-hidden rounded-lg bg-surface-card shadow-lg">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {getHeaderIcon()}
        <span className="flex-1 text-left text-sm font-medium">
          {getHeaderText()}
        </span>
        {expanded ? (
          <ChevronDown className="size-4 text-fg-tertiary" />
        ) : (
          <ChevronUp className="size-4 text-fg-tertiary" />
        )}
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          {panelStatus === "active" && (
            <p className="px-3 pb-1 text-xs text-fg-tertiary">
              {t("session.save_queue_panel_hint")}
            </p>
          )}
          <div className="max-h-48 overflow-y-auto pb-1">
            {visibleItems.map((item) => (
              <SaveQueueItem
                key={item.jobId}
                jobId={item.jobId}
                status={item.status}
                snippet={item.snippet}
                onRetry={retry}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

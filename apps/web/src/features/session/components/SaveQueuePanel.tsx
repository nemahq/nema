import { useMemo, useState } from "react";

import { cn } from "@nema-io/weave";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "@nema-io/weave/icons";

import {
  type PanelStatus,
  useSaveQueue,
} from "@web/features/session/contexts/SaveQueueContext";
import { useTranslation } from "@web/lib/tolgee";

import { SaveQueueItem } from "./SaveQueueItem";

const HEADER_ICON: Record<PanelStatus, React.ReactNode> = {
  completed: <Check className="size-4 text-status-success" />,
  failed: <AlertCircle className="size-4 text-status-error" />,
  active: <Loader2 className="size-4 animate-spin text-fg-tertiary" />,
};

interface SaveQueueHeaderProps {
  panelStatus: PanelStatus;
  completedCount: number;
  failedCount: number;
  totalCount: number;
  expanded: boolean;
  onToggle: () => void;
}

function SaveQueueHeader({
  panelStatus,
  completedCount,
  failedCount,
  totalCount,
  expanded,
  onToggle,
}: SaveQueueHeaderProps) {
  const { t } = useTranslation();

  function getHeaderText(): string {
    if (panelStatus === "completed") {
      return t("session.save_queue_panel_completed");
    }
    if (panelStatus === "failed" && completedCount > 0) {
      return t("session.save_queue_panel_partial_fail", {
        completed: completedCount,
        failed: failedCount,
      });
    }
    if (panelStatus === "failed") {
      return t("session.save_queue_panel_all_failed", {
        count: failedCount,
      });
    }
    return t("session.save_queue_panel_active", {
      completed: completedCount,
      total: totalCount,
    });
  }

  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5"
      onClick={onToggle}
    >
      {HEADER_ICON[panelStatus]}
      <span className="flex-1 text-left text-sm font-medium">
        {getHeaderText()}
      </span>
      {expanded ? (
        <ChevronDown className="size-4 text-fg-tertiary" />
      ) : (
        <ChevronUp className="size-4 text-fg-tertiary" />
      )}
    </button>
  );
}

export function SaveQueuePanel() {
  const { t } = useTranslation();
  const { items, retry } = useSaveQueue();
  const [expanded, setExpanded] = useState(false);
  const [prevPanelStatus, setPrevPanelStatus] = useState<PanelStatus | null>(
    null,
  );

  const { panelStatus, completedCount, failedCount, visibleItems } =
    useMemo(() => {
      let completed = 0;
      let failed = 0;
      let hasActive = false;
      const failedJobs: typeof items = [];

      for (const job of items) {
        if (job.status === "completed") {
          completed++;
        } else if (job.status === "failed") {
          failed++;
          failedJobs.push(job);
        } else {
          hasActive = true;
        }
      }

      let panelStatus: PanelStatus = "completed";
      if (hasActive) {
        panelStatus = "active";
      } else if (failed > 0) {
        panelStatus = "failed";
      }

      return {
        panelStatus,
        completedCount: completed,
        failedCount: failed,
        visibleItems: panelStatus === "failed" ? failedJobs : items,
      };
    }, [items]);

  if (items.length === 0) {
    if (expanded) {
      setExpanded(false);
    }
    if (prevPanelStatus !== null) {
      setPrevPanelStatus(null);
    }
    return null;
  }

  if (panelStatus !== prevPanelStatus) {
    setPrevPanelStatus(panelStatus);
    if (panelStatus === "failed") {
      setExpanded(true);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 overflow-hidden rounded-lg bg-surface-card shadow-lg">
      <SaveQueueHeader
        panelStatus={panelStatus}
        completedCount={completedCount}
        failedCount={failedCount}
        totalCount={items.length}
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
      />

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

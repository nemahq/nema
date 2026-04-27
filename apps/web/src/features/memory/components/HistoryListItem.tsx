import type { MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import {
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  RotateCcw,
} from "@nema-io/weave/icons";

import {
  formatHistoryTime,
  formatHistoryTimeTooltip,
} from "@web/features/memory/utils/historyTime";
import { useTranslation } from "@web/lib/tolgee";

type HistoryStatus = "processing" | "completed" | "failed";

interface HistoryListItemProps {
  id: string;
  createdAt: string;
  primaryMemoryName: string | null;
  memoryCount: number;
  sessionId: string | null;
  status: HistoryStatus;
}

export function HistoryListItem({
  id,
  createdAt,
  primaryMemoryName,
  memoryCount,
  sessionId,
  status,
}: HistoryListItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const date = new Date(createdAt);
  const memoryName = primaryMemoryName ?? t("memory.history_unnamed");
  const extraCount = memoryCount - 1;

  function handleRowClick() {
    void navigate({
      to: "/memory/history/$historyId",
      params: { historyId: id },
    });
  }

  function handleSessionClick(e: MouseEvent) {
    e.stopPropagation();
    if (!sessionId) {
      return;
    }
    void navigate({
      to: "/session/$sessionId",
      params: { sessionId },
    });
  }

  return (
    <button
      type="button"
      onClick={handleRowClick}
      className="flex w-full items-center gap-3 px-4 py-3 rounded-lg hover:bg-surface-raised cursor-pointer"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <time
            dateTime={createdAt}
            className="text-xs text-fg-secondary w-16 shrink-0"
          >
            {formatHistoryTime(date)}
          </time>
        </TooltipTrigger>
        <TooltipContent>{formatHistoryTimeTooltip(date)}</TooltipContent>
      </Tooltip>

      <div className="flex flex-1 min-w-0 items-center gap-1.5">
        <span className="text-sm text-fg-primary truncate">{memoryName}</span>
        {extraCount > 0 && (
          <span className="text-xs text-fg-secondary shrink-0">
            {t("common.overflow_count", { count: extraCount })}
          </span>
        )}
      </div>

      {status === "processing" && (
        <Badge variant="info" className="inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" />
          {t("memory.history_status_processing")}
        </Badge>
      )}

      {status === "failed" && (
        <div className="flex items-center gap-1">
          <Badge variant="error" className="inline-flex items-center gap-1">
            <AlertTriangle className="size-3" />
            {t("memory.history_status_failed")}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => e.stopPropagation()}
                // TODO(NEM-100): 재시도 API 연결
              >
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.retry")}</TooltipContent>
          </Tooltip>
        </div>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleSessionClick}
            disabled={!sessionId}
          >
            <ArrowUpRight />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {sessionId
            ? t("memory.history_go_to_session")
            : t("memory.history_session_deleted")}
        </TooltipContent>
      </Tooltip>
    </button>
  );
}

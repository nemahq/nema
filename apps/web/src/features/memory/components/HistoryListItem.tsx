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
} from "@web/features/memory/historyTime";
import type { HistoryListItem } from "@web/features/memory/hooks/useHistoryList";

const UNNAMED_MEMORY_LABEL = "이름 없는 기억";

interface HistoryListItemProps {
  item: HistoryListItem;
}

export function HistoryListItem({ item }: HistoryListItemProps) {
  const navigate = useNavigate();
  const createdAt = new Date(item.createdAt);
  const memoryName = item.primaryMemory.name ?? UNNAMED_MEMORY_LABEL;
  const extraCount = item.memoryCount - 1;

  function handleRowClick() {
    void navigate({
      to: "/memory/history/$historyId",
      params: { historyId: item.id },
    });
  }

  function handleSessionClick(e: MouseEvent) {
    e.stopPropagation();
    if (!item.sessionId) {
      return;
    }
    void navigate({
      to: "/session/$sessionId",
      params: { sessionId: item.sessionId },
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => e.key === "Enter" && handleRowClick()}
      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-surface-raised cursor-pointer"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <time
            dateTime={item.createdAt}
            className="text-xs text-fg-secondary w-16 shrink-0"
          >
            {formatHistoryTime(createdAt)}
          </time>
        </TooltipTrigger>
        <TooltipContent>{formatHistoryTimeTooltip(createdAt)}</TooltipContent>
      </Tooltip>

      <div className="flex flex-1 min-w-0 items-center gap-1.5">
        <span className="text-sm text-fg-primary truncate">{memoryName}</span>
        {extraCount > 0 && (
          <span className="text-xs text-fg-secondary shrink-0">
            외 {extraCount}개
          </span>
        )}
      </div>

      {item.status === "processing" && (
        <Badge variant="info" className="inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" />
          정리 중
        </Badge>
      )}

      {item.status === "failed" && (
        <div className="flex items-center gap-1">
          <Badge variant="error" className="inline-flex items-center gap-1">
            <AlertTriangle className="size-3" />
            정리 실패
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
            <TooltipContent>다시 시도</TooltipContent>
          </Tooltip>
        </div>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleSessionClick}
            disabled={!item.sessionId}
          >
            <ArrowUpRight />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {item.sessionId ? "대화로 이동" : "삭제된 대화"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

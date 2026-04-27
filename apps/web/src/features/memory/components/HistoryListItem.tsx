import { useNavigate } from "@tanstack/react-router";

import { ChevronRight } from "@nema-io/weave/icons";

import {
  type HistoryStatus,
  HistoryStatusIcon,
} from "@web/features/memory/components/HistoryStatusIcon";
import { formatHistoryTime } from "@web/features/memory/utils/historyTime";
import { useTranslation } from "@web/lib/tolgee";

interface HistoryListItemProps {
  id: string;
  createdAt: string;
  primaryMemoryName: string | null;
  memoryCount: number;
  status: HistoryStatus;
}

export function HistoryListItem({
  id,
  createdAt,
  primaryMemoryName,
  memoryCount,
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

  return (
    <button
      type="button"
      onClick={handleRowClick}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 text-left hover:bg-stone-100 active:bg-stone-200 dark:hover:bg-stone-700 dark:active:bg-stone-600"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <time dateTime={createdAt} className="text-xs text-fg-secondary">
            {formatHistoryTime(date)}
          </time>
          <HistoryStatusIcon status={status} />
        </div>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-base font-semibold text-fg-primary">
            {memoryName}
          </span>
          {extraCount > 0 && (
            <span className="shrink-0 text-xs text-fg-secondary">
              {t("common.overflow_count", { count: extraCount })}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="size-4 shrink-0 text-fg-secondary opacity-0 group-hover:opacity-100" />
    </button>
  );
}

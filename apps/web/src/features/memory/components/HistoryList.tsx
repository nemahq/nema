import { useRef } from "react";

import { Skeleton } from "@nema-io/weave";

import { HistoryListItem } from "@web/features/memory/components/HistoryListItem";
import { HistoryListSkeleton } from "@web/features/memory/components/HistoryListSkeleton";
import { useHistoryListInfiniteQuery } from "@web/features/memory/hooks/useHistoryList";
import {
  getTimeGroup,
  type TimeGroup,
  timeGroupId,
} from "@web/features/memory/utils/historyTime";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useTranslation } from "@web/lib/tolgee";

export function HistoryList() {
  const { t } = useTranslation();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useHistoryListInfiniteQuery();

  const sentinelRef = useRef<HTMLDivElement>(null);

  useIntersectionEffect({
    ref: sentinelRef,
    onIntersect: fetchNextPage,
    enabled: hasNextPage && !isFetchingNextPage,
  });

  if (isLoading) {
    return <HistoryListSkeleton />;
  }

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const groups = groupByTimeGroup(items);

  return (
    <div className="max-w-3xl space-y-6 px-8 py-6">
      {groups.map((group) => (
        <div key={group.id}>
          <div className="sticky top-0 flex items-center gap-3 bg-surface-card py-2">
            <p className="text-xs font-semibold text-fg-secondary">
              {formatGroupLabel(group.label, t)}
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-0.5">
            {group.items.map((historyItem) => (
              <HistoryListItem
                key={historyItem.id}
                id={historyItem.id}
                createdAt={historyItem.createdAt}
                primaryMemoryName={historyItem.primaryMemory.name}
                memoryCount={historyItem.memoryCount}
                status={historyItem.status}
              />
            ))}
          </div>
        </div>
      ))}

      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="py-2">
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

type HistoryGroup = {
  id: string;
  label: TimeGroup;
  items: NonNullable<
    ReturnType<typeof useHistoryListInfiniteQuery>["data"]
  >["pages"][number]["items"];
};

function groupByTimeGroup(items: HistoryGroup["items"]): HistoryGroup[] {
  const groups: HistoryGroup[] = [];

  for (const historyItem of items) {
    const label = getTimeGroup(new Date(historyItem.createdAt));
    const id = timeGroupId(label);
    const last = groups[groups.length - 1];
    if (last && last.id === id) {
      last.items.push(historyItem);
    } else {
      groups.push({ id, label, items: [historyItem] });
    }
  }

  return groups;
}

function formatGroupLabel(
  group: TimeGroup,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (group.kind) {
    case "today":
      return t("memory.history_group_today");
    case "yesterday":
      return t("memory.history_group_yesterday");
    case "this_week":
      return t("memory.history_group_this_week");
    case "this_month":
      return t("memory.history_group_this_month");
    case "this_year":
      return t("memory.history_group_this_year");
    case "year":
      return t("memory.history_group_year", { year: group.year });
  }
}

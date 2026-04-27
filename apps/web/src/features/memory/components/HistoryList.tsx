import { useEffect, useRef } from "react";

import { Skeleton } from "@nema-io/weave";

import { HistoryListItem } from "@web/features/memory/components/HistoryListItem";
import { useHistoryListInfiniteQuery } from "@web/features/memory/hooks/useHistoryList";
import { MOCK_HISTORY_ITEMS } from "@web/features/memory/mocks/historyList";
import {
  getTimeGroup,
  type TimeGroup,
  timeGroupId,
} from "@web/features/memory/utils/historyTime";
import { useTranslation } from "@web/lib/tolgee";

export function HistoryList() {
  const { t } = useTranslation();
  const { isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useHistoryListInfiniteQuery();

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(
    function observeSentinel() {
      const sentinel = sentinelRef.current;
      if (!sentinel) {
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (
            entries[0]?.isIntersecting &&
            hasNextPage &&
            !isFetchingNextPage
          ) {
            void fetchNextPage();
          }
        },
        { threshold: 0.1 },
      );

      observer.observe(sentinel);
      return () => observer.disconnect();
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  if (isLoading) {
    return <HistoryListSkeleton />;
  }

  // TODO(테스트): 임시 mock — 확인 후 제거
  const items = MOCK_HISTORY_ITEMS;

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

const SKELETON_TITLE_WIDTHS = ["w-3/4", "w-2/3", "w-1/2"] as const;
const SKELETON_GROUP_ROW_COUNTS = [3, 3] as const;

function HistoryListSkeleton() {
  return (
    <div className="max-w-3xl space-y-6 px-8 py-6">
      {SKELETON_GROUP_ROW_COUNTS.map((rowCount, groupIdx) => (
        <div key={groupIdx}>
          <div className="flex items-center gap-3 py-2">
            <Skeleton className="h-3 w-10" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-0.5">
            {Array.from({ length: rowCount }, (_, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex flex-1 flex-col gap-0.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton
                    className={`h-5 ${
                      SKELETON_TITLE_WIDTHS[
                        rowIdx % SKELETON_TITLE_WIDTHS.length
                      ]
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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

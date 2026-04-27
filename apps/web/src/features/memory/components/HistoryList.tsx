import { useEffect, useRef } from "react";

import { Skeleton } from "@nema-io/weave";

import { HistoryListItem } from "@web/features/memory/components/HistoryListItem";
import { getTimeGroup } from "@web/features/memory/historyTime";
import { useHistoryListInfiniteQuery } from "@web/features/memory/hooks/useHistoryList";

export function HistoryList() {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
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

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-fg-secondary">
        아직 정리된 기억이 없어요.
      </div>
    );
  }

  const groups = groupByTimeGroup(items);

  return (
    <div className="flex flex-col overflow-y-auto">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-4 py-2 text-xs font-medium text-fg-secondary sticky top-0 bg-surface-card">
            {group.label}
          </p>
          {group.items.map((item) => (
            <HistoryListItem key={item.id} item={item} />
          ))}
        </div>
      ))}

      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="px-4 py-2">
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

function HistoryListSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-4 py-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

type HistoryGroup = {
  label: string;
  items: NonNullable<
    ReturnType<typeof useHistoryListInfiniteQuery>["data"]
  >["pages"][number]["items"];
};

function groupByTimeGroup(items: HistoryGroup["items"]): HistoryGroup[] {
  const groups: HistoryGroup[] = [];

  for (const historyItem of items) {
    const label = getTimeGroup(new Date(historyItem.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(historyItem);
    } else {
      groups.push({ label, items: [historyItem] });
    }
  }

  return groups;
}

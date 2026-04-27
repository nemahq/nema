import { trpc } from "@web/lib/trpc";

const HISTORY_LIST_STALE_TIME_MS = 60_000;

export function useHistoryList() {
  const [data, { hasNextPage, fetchNextPage, isFetchingNextPage }] =
    trpc.history.list.useSuspenseInfiniteQuery(
      {},
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        staleTime: HISTORY_LIST_STALE_TIME_MS,
      },
    );

  const histories = data.pages.flatMap((page) => page.items);

  return { histories, hasNextPage, fetchNextPage, isFetchingNextPage };
}

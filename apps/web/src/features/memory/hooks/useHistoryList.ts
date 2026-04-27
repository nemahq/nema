import { trpc } from "@web/lib/trpc";

const HISTORY_LIST_STALE_TIME_MS = 60_000;

export function useHistoryListInfiniteQuery(
  options?: Omit<
    Parameters<typeof trpc.history.list.useInfiniteQuery>[1],
    "queryKey"
  >,
) {
  return trpc.history.list.useInfiniteQuery(
    {},
    {
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      staleTime: HISTORY_LIST_STALE_TIME_MS,
      ...options,
    },
  );
}

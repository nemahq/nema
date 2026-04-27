import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

import { trpc } from "@web/lib/trpc";

type RouterOutput = inferRouterOutputs<AppRouter>;
export type HistoryListItem = RouterOutput["history"]["list"]["items"][number];

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

import { useMemo } from "react";

import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

export function useSessionList() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    trpc.session.list.useInfiniteQuery(
      { limit: SESSION_LIST_LIMIT },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    );

  const sessions = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  return { sessions, hasNextPage, fetchNextPage, isFetchingNextPage };
}

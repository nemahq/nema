import { useMemo } from "react";

import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

export function prependSessionCache(
  utils: ReturnType<typeof trpc.useUtils>,
  newSession: { id: string },
) {
  utils.session.list.setInfiniteData({ limit: SESSION_LIST_LIMIT }, (old) => {
    if (!old?.pages[0]) return old;
    const [firstPage, ...rest] = old.pages;
    return {
      ...old,
      pages: [
        { ...firstPage, items: [newSession, ...firstPage.items] },
        ...rest,
      ],
    };
  });
}

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

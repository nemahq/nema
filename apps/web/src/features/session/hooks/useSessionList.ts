import { useMemo } from "react";

import type { SessionSummary } from "@nema-io/shared";

import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

export function prependSessionCache(
  utils: ReturnType<typeof trpc.useUtils>,
  newSession: SessionSummary,
) {
  utils.session.list.setInfiniteData({ limit: SESSION_LIST_LIMIT }, (old) => {
    if (!old?.pages[0]) {
      return old;
    }
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

export function removeSessionCache(
  utils: ReturnType<typeof trpc.useUtils>,
  sessionId: string,
) {
  utils.session.list.setInfiniteData({ limit: SESSION_LIST_LIMIT }, (old) => {
    if (!old) {
      return old;
    }
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.filter((s) => s.id !== sessionId),
      })),
    };
  });
}

export function updateSessionCache(
  utils: ReturnType<typeof trpc.useUtils>,
  updated: SessionSummary,
) {
  utils.session.list.setInfiniteData({ limit: SESSION_LIST_LIMIT }, (old) => {
    if (!old) {
      return old;
    }
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.map((s) => (s.id === updated.id ? updated : s)),
      })),
    };
  });
}

export function useSessionList() {
  const [data, { hasNextPage, fetchNextPage, isFetchingNextPage }] =
    trpc.session.list.useSuspenseInfiniteQuery(
      { limit: SESSION_LIST_LIMIT },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    );

  const sessions = useMemo(
    () => data.pages.flatMap((page) => page.items),
    [data],
  );

  return { sessions, hasNextPage, fetchNextPage, isFetchingNextPage };
}

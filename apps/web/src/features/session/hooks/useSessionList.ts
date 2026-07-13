import type { SessionSummary } from "@nema-io/shared";

import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

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

export function updateSessionTitleCache(
  utils: ReturnType<typeof trpc.useUtils>,
  sessionId: string,
  title: string,
) {
  utils.session.list.setInfiniteData({ limit: SESSION_LIST_LIMIT }, (old) => {
    if (!old) {
      return old;
    }
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.map((s) =>
          s.id === sessionId ? { ...s, title } : s,
        ),
      })),
    };
  });
}

const SESSION_LIST_STALE_TIME_MS = 300_000;

export function useSessionList() {
  const [data, { hasNextPage, fetchNextPage, isFetchingNextPage }] =
    trpc.session.list.useSuspenseInfiniteQuery(
      { limit: SESSION_LIST_LIMIT },
      {
        staleTime: SESSION_LIST_STALE_TIME_MS,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    );

  const sessions = data.pages.flatMap((page) => page.items);

  return { sessions, hasNextPage, fetchNextPage, isFetchingNextPage };
}

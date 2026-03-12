import { memo, useEffect, useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";

import type { SessionSummary } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

const SessionItem = memo(function SessionItem({
  session,
}: {
  session: SessionSummary;
}) {
  const { t } = useTranslation();
  const title = session.title ?? t("session.untitled");

  return (
    <Link
      to="/context/$sessionId"
      params={{ sessionId: session.id }}
      className="w-full cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-fast"
      activeProps={{
        className: "bg-surface-raised-hover text-fg-primary font-medium",
      }}
      inactiveProps={{
        className: "text-fg-secondary hover:bg-surface-raised-hover",
      }}
    >
      {title}
    </Link>
  );
});

export function SessionList({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    trpc.session.list.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    );

  const sessions = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  useEffect(
    function observeSentinel() {
      const sentinel = sentinelRef.current;
      if (!sentinel || !hasNextPage || isFetchingNextPage) return;

      const observer = new IntersectionObserver(
        function handleIntersection(entries) {
          if (entries[0]?.isIntersecting) {
            fetchNextPage();
          }
        },
        { rootMargin: "200px" },
      );

      observer.observe(sentinel);
      return function cleanup() {
        observer.disconnect();
      };
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  if (collapsed) return null;

  return (
    <div className="px-1.5">
      <h2 className="px-1.5 pb-1 pt-3 text-xs font-medium text-fg-tertiary">
        {t("session.your_contexts")}
      </h2>

      <div className="flex flex-col gap-0.5">
        {sessions.map((session) => (
          <SessionItem key={session.id} session={session} />
        ))}
      </div>

      {hasNextPage && <div ref={sentinelRef} className="h-4" />}
    </div>
  );
}

import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { SessionSummary } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";

import { fetchMockSessions } from "../mock";

const INITIAL = fetchMockSessions();

const SessionItem = memo(function SessionItem({
  session,
}: {
  session: SessionSummary;
}) {
  const { t } = useTranslation();
  const title = session.title ?? t("session.untitled");

  return (
    <button
      type="button"
      className="w-full cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-sm text-fg-secondary transition-colors duration-fast hover:bg-surface-raised-hover"
    >
      {title}
    </button>
  );
});

export function SessionList({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionSummary[]>(INITIAL.items);
  const [nextCursor, setNextCursor] = useState<string | null>(
    INITIAL.nextCursor,
  );
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(
    function loadMore() {
      if (!nextCursor) return;
      const result = fetchMockSessions(nextCursor);
      setSessions((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    },
    [nextCursor],
  );

  useEffect(
    function observeSentinel() {
      const sentinel = sentinelRef.current;
      if (!sentinel || !nextCursor) return;

      const observer = new IntersectionObserver(
        function handleIntersection(entries) {
          if (entries[0]?.isIntersecting) {
            loadMore();
          }
        },
        { rootMargin: "200px" },
      );

      observer.observe(sentinel);
      return function cleanup() {
        observer.disconnect();
      };
    },
    [nextCursor, loadMore],
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

      {nextCursor && <div ref={sentinelRef} className="h-4" />}
    </div>
  );
}

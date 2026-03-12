import { memo, useRef } from "react";
import { Link } from "@tanstack/react-router";

import type { SessionSummary } from "@nema-io/shared";

import { useSessionList } from "@web/features/session/hooks/useSessionList";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useTranslation } from "@web/lib/tolgee";

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

  const { sessions, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSessionList();

  useIntersectionEffect(sentinelRef, fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  });

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

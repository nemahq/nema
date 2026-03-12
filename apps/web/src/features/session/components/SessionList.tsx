import { useRef } from "react";

import { useSessionList } from "@web/features/session/hooks/useSessionList";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useTranslation } from "@web/lib/tolgee";

import { SessionItem } from "./SessionItem";

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

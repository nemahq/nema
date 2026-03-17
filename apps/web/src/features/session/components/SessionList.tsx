import { Suspense, useCallback, useRef } from "react";
import { useMatch, useNavigate } from "@tanstack/react-router";

import { Skeleton } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useSessionList } from "@web/features/session/hooks/useSessionList";
import { useRegisterAction } from "@web/hooks/shortcut/useRegisterAction";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useTranslation } from "@web/lib/tolgee";

import { SessionItem } from "./SessionItem";
import { SessionListSkeleton } from "./SessionListSkeleton";

function SessionListContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const sessionMatch = useMatch({
    from: "/_authenticated/_sessionSidebar/session/$sessionId",
    shouldThrow: false,
  });
  const currentSessionId = sessionMatch?.params.sessionId;

  const { sessions, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSessionList();

  const navigateSession = useCallback(
    (direction: -1 | 1) => {
      if (sessions.length === 0) {
        return;
      }
      const currentIndex = currentSessionId
        ? sessions.findIndex((s) => s.id === currentSessionId)
        : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + direction + sessions.length) % sessions.length;
      const next = sessions[nextIndex];
      if (next && next.id !== currentSessionId) {
        navigate({
          to: "/session/$sessionId",
          params: { sessionId: next.id },
        });
      }
    },
    [sessions, currentSessionId, navigate],
  );

  useRegisterAction("navigation.prevSession", {
    execute: () => navigateSession(-1),
    enabled: sessions.length > 0,
  });

  useRegisterAction("navigation.nextSession", {
    execute: () => navigateSession(1),
    enabled: sessions.length > 0,
  });

  useIntersectionEffect({
    ref: sentinelRef,
    onIntersect: fetchNextPage,
    enabled: hasNextPage && !isFetchingNextPage,
  });

  return (
    <div className="px-1.5">
      <h2 className="px-1.5 pb-1 pt-3 text-xs font-medium text-fg-tertiary">
        {t("session.your_contexts")}
      </h2>

      <div className="flex flex-col gap-0.5">
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            sessionId={session.id}
            title={session.title}
          />
        ))}
      </div>

      {hasNextPage && (
        <div ref={sentinelRef} className="flex flex-col gap-0.5">
          {isFetchingNextPage && (
            <>
              <div className="px-2 py-1.5">
                <Skeleton className="h-[18px] w-2/3 rounded-sm" />
              </div>
              <div className="px-2 py-1.5">
                <Skeleton
                  className="h-[18px] w-1/2 rounded-sm"
                  style={{ opacity: 0.6 }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SessionList() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={<SessionListSkeleton />}>
        <SessionListContent />
      </Suspense>
    </ErrorBoundary>
  );
}

import { Suspense, useRef } from "react";
import { useMatch, useNavigate } from "@tanstack/react-router";

import { Skeleton, Text } from "@nema-io/weave";

import { useSidebar } from "@web/components/layout/Sidebar";
import { useSessionList } from "@web/features/session/hooks/useSessionList";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
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

  function navigateSession(direction: -1 | 1) {
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
  }

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
      <Text
        as="h2"
        size="xs"
        bold
        color="tertiary"
        className="px-1.5 pb-1 pt-3"
      >
        {t("session.your_contexts")}
      </Text>

      <div className="flex flex-col gap-0.5">
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            sessionId={session.id}
            title={session.title}
            isActive={session.id === currentSessionId}
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
  const { collapsed } = useSidebar();

  if (collapsed) {
    return null;
  }

  return (
    <Suspense fallback={<SessionListSkeleton />}>
      <SessionListContent />
    </Suspense>
  );
}

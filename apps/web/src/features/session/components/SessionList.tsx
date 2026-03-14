import { Suspense, useRef } from "react";

import { Skeleton } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useSessionList } from "@web/features/session/hooks/useSessionList";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useTranslation } from "@web/lib/tolgee";

import { SessionItem } from "./SessionItem";
import { SessionListSkeleton } from "./SessionListSkeleton";

function SessionListContent() {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { sessions, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSessionList();

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
          <SessionItem key={session.id} session={session} />
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

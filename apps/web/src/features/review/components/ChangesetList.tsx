import { Suspense, useRef } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";

import { Text } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { changesetDisplayState } from "@web/features/review/constants";
import { useChangesetListInfiniteQuery } from "@web/features/review/hooks/useChangesetListQuery";
import type { ChangesSubTab } from "@web/features/review/types";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetListRow } from "./ChangesetListRow";
import { ChangesetListSkeleton } from "./ChangesetListSkeleton";

interface ChangesetListProps {
  subTab: ChangesSubTab;
}

function ChangesetListContent({ subTab }: ChangesetListProps) {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const [changesetPages, query] = useChangesetListInfiniteQuery(
    spaceId,
    subTab === "open",
  );
  const entries = changesetPages.pages.flatMap((page) => page.changesets);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useIntersectionEffect({
    ref: sentinelRef,
    onIntersect: query.fetchNextPage,
    enabled: query.hasNextPage && !query.isFetchingNextPage,
  });

  if (entries.length === 0) {
    return (
      <Text size="sm" color="tertiary" className="py-12 text-center">
        {subTab === "open"
          ? t("review.changes_empty_open")
          : t("review.changes_empty_closed")}
      </Text>
    );
  }

  return (
    <div className="flex flex-col">
      {entries.map((entry, index) => (
        <ChangesetListRow
          key={entry.id}
          changesetNumber={entry.number}
          title={entry.title}
          type={entry.type}
          state={changesetDisplayState(
            entry.status,
            entry.outcome,
            entry.number,
          )}
          createdAt={entry.createdAt}
          effectDigest={entry.effect.digest}
          effectReference={entry.effect.reference}
          hideDivider={index === entries.length - 1 && !query.hasNextPage}
        />
      ))}
      {query.hasNextPage ? (
        <div ref={sentinelRef} className="flex flex-col">
          {query.isFetchingNextPage && <ChangesetListSkeleton />}
        </div>
      ) : (
        <Text size="xs" color="tertiary" className="py-4 text-center">
          {t("common.list_end")}
        </Text>
      )}
    </div>
  );
}

// 서브탭 버튼은 목록이 로딩·실패 중에도 눌러야 해서 경계를 목록에만 두른다 —
// 형제인 버튼들은 그대로 남는다.
export function ChangesetList(props: ChangesetListProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset: resetQueryError }) => (
        <ErrorBoundary
          boundaryName="changes-list"
          fallbackRender={(fallbackProps) => (
            <SectionErrorFallback
              {...fallbackProps}
              reset={() => {
                resetQueryError();
                fallbackProps.reset();
              }}
            />
          )}
        >
          <Suspense
            fallback={
              <div className="flex flex-col">
                <ChangesetListSkeleton />
              </div>
            }
          >
            <ChangesetListContent {...props} />
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

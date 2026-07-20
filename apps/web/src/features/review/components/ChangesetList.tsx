import { Suspense, useRef } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { useChangesetListInfiniteQuery } from "@web/features/review/hooks/useChangesetListQuery";
import type {
  ChangesetListEntry,
  ChangesSubTab,
} from "@web/features/review/types";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetListRow } from "./ChangesetListRow";
import { ChangesetListSkeleton } from "./ChangesetListSkeleton";

interface ChangesetListProps {
  spacePublicId: string;
  spaceId: string;
  subTab: ChangesSubTab;
}

// surface-inventory.md는 Open의 relation도 관계 판정 화면으로 이동한다고 적어뒀지만
// 그 화면이 아직 없다 — 목적지가 생길 때까지 목록에 보이기만 하고 클릭은 막는다.
// 즉 이건 목적지 설계가 아니라 이번 슬라이스의 구현 한계다.
//
// Closed에서는 막지 않는다 — 이미 끝난 항목은 status에 따라 상세 쪽 게이트가
// 알맞은 화면을 고른다.
function isLinkable(entry: ChangesetListEntry, subTab: ChangesSubTab): boolean {
  return !(subTab === "open" && entry.type !== "ingestion");
}

function ChangesetListContent({
  spacePublicId,
  spaceId,
  subTab,
}: ChangesetListProps) {
  const { t } = useTranslation();
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
      <p className="py-12 text-center text-sm text-fg-tertiary">
        {subTab === "open"
          ? t("review.changes_empty_open")
          : t("review.changes_empty_closed")}
      </p>
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
          status={entry.status}
          createdAt={entry.createdAt}
          authorId={entry.authorId}
          effectDigest={entry.effect.digest}
          effectReference={entry.effect.reference}
          spacePublicId={spacePublicId}
          linkable={isLinkable(entry, subTab)}
          hideDivider={index === entries.length - 1 && !query.hasNextPage}
        />
      ))}
      {query.hasNextPage ? (
        <div ref={sentinelRef} className="flex flex-col gap-2">
          {query.isFetchingNextPage && <ChangesetListSkeleton />}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-fg-tertiary">
          {t("common.list_end")}
        </p>
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
              <div className="flex flex-col gap-2">
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

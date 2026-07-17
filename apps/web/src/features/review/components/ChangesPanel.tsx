import { Suspense, useRef } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { linkOptions } from "@tanstack/react-router";

import { Button, cn, Skeleton } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { useChangesetListInfiniteQuery } from "@web/features/review/hooks/useChangesetListQuery";
import type {
  ChangesetListEntry,
  ChangesSubTab,
} from "@web/features/review/types";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import type { LooseLinkTarget } from "@web/lib/link";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetListRow } from "./ChangesetListRow";

interface ChangesSubTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: string;
}

function ChangesSubTabButton({
  active,
  onClick,
  children,
}: ChangesSubTabButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={onClick}
      className={cn(
        "font-medium",
        active
          ? "bg-surface-raised-hover text-fg-primary"
          : "text-fg-tertiary hover:text-fg-secondary",
      )}
    >
      {children}
    </Button>
  );
}

// 페칭 페이지 크기(CHANGESET_LIST_LIMIT_DEFAULT)와는 무관하게, 뷰포트에 실제로
// 보이는 만큼만 흉내낸다 — 화면 밖까지 스켈레톤을 채우는 건 낭비.
const CHANGES_LIST_SKELETON_COUNT = 8;
// ChangesetListRow의 1줄(아이콘+제목)·2줄 구조를 그대로 흉내내야 로딩→데이터
// 전환 시 행 높이가 튀지 않는다.
const SKELETON_TITLE_WIDTHS = ["w-2/5", "w-1/2", "w-1/3"];
const SKELETON_STAGGER_DELAY_MS = 60;

interface ChangesetRowSkeletonProps {
  index: number;
  hideDivider: boolean;
}

function ChangesetRowSkeleton({
  index,
  hideDivider,
}: ChangesetRowSkeletonProps) {
  const delay = { animationDelay: `${index * SKELETON_STAGGER_DELAY_MS}ms` };
  return (
    <div>
      <div className="flex w-full flex-col gap-0.5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-4 shrink-0 rounded-full" style={delay} />
          <Skeleton
            className={cn(
              "h-3.5",
              SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.length],
            )}
            style={delay}
          />
        </div>
        <div className="flex items-center gap-2.5">
          {/* 실제 행의 2줄 자리맞춤용 스페이서(ChangesetListRow 참고)와 같은 폭 */}
          <span aria-hidden="true" className="inline-flex size-4 shrink-0" />
          <Skeleton className="h-[11px] w-1/4" style={delay} />
        </div>
      </div>
      {!hideDivider && <div className="mx-2 border-b border-border/50" />}
    </div>
  );
}

function ChangesListSkeleton() {
  return (
    <>
      {Array.from({ length: CHANGES_LIST_SKELETON_COUNT }).map((_, i) => (
        <ChangesetRowSkeleton
          key={i}
          index={i}
          hideDivider={i === CHANGES_LIST_SKELETON_COUNT - 1}
        />
      ))}
    </>
  );
}

interface ChangesListProps {
  spacePublicId: string;
  spaceId: string;
  subTab: ChangesSubTab;
}

function ChangesList({ spacePublicId, spaceId, subTab }: ChangesListProps) {
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

  // Open에서는 ingestion만 실제 리뷰 화면이 있다 — relation 상세는 review 2차 몫이라
  // 이번 슬라이스는 목록에 보이기만 하고 클릭은 막는다(surface-inventory.md).
  function linkTarget(entry: ChangesetListEntry): LooseLinkTarget {
    if (subTab === "closed") {
      return linkOptions({
        to: "/space/$spacePublicId/changesets/$changesetId",
        params: { spacePublicId, changesetId: entry.id },
      });
    }
    return entry.type === "ingestion"
      ? linkOptions({
          to: "/space/$spacePublicId/review/$changesetId",
          params: { spacePublicId, changesetId: entry.id },
        })
      : {};
  }

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
          entry={entry}
          {...linkTarget(entry)}
          hideDivider={index === entries.length - 1 && !query.hasNextPage}
        />
      ))}
      {query.hasNextPage ? (
        <div ref={sentinelRef} className="flex flex-col gap-2">
          {query.isFetchingNextPage && <ChangesListSkeleton />}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-fg-tertiary">
          {t("common.list_end")}
        </p>
      )}
    </div>
  );
}

interface ChangesPanelProps {
  spacePublicId: string;
  spaceId: string | undefined;
  subTab: ChangesSubTab;
  onSubTabChange: (subTab: ChangesSubTab) => void;
}

export function ChangesPanel({
  spacePublicId,
  spaceId,
  subTab,
  onSubTabChange,
}: ChangesPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-3 py-4">
      <div className="flex w-fit gap-1 rounded-lg bg-surface-card p-1">
        <ChangesSubTabButton
          active={subTab === "open"}
          onClick={() => onSubTabChange("open")}
        >
          {t("review.tab_open")}
        </ChangesSubTabButton>
        <ChangesSubTabButton
          active={subTab === "closed"}
          onClick={() => onSubTabChange("closed")}
        >
          {t("review.tab_closed")}
        </ChangesSubTabButton>
      </div>

      {spaceId && (
        <QueryErrorResetBoundary>
          {({ reset: resetQueryError }) => (
            <ErrorBoundary
              boundaryName="changes-list"
              fallbackRender={(props) => (
                <SectionErrorFallback
                  {...props}
                  reset={() => {
                    resetQueryError();
                    props.reset();
                  }}
                />
              )}
            >
              <Suspense
                fallback={
                  <div className="flex flex-col gap-2">
                    <ChangesListSkeleton />
                  </div>
                }
              >
                <ChangesList
                  spacePublicId={spacePublicId}
                  spaceId={spaceId}
                  subTab={subTab}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </QueryErrorResetBoundary>
      )}
    </div>
  );
}

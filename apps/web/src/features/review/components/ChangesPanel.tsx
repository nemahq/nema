import { Suspense, useEffect, useState } from "react";

import { Button, cn, Skeleton } from "@nema-io/weave";

import { useChangesetListInfiniteQuery } from "@web/features/review/hooks/useChangesetListQuery";
import type { ChangesetListEntry } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetListRow } from "./ChangesetListRow";

type ChangesSubTab = "open" | "closed";

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

interface ChangesListProps {
  spaceId: string;
  subTab: ChangesSubTab;
  onOpenReview: (changesetId: string) => void;
  onOpenDetail: (changesetId: string) => void;
}

function ChangesList({
  spaceId,
  subTab,
  onOpenReview,
  onOpenDetail,
}: ChangesListProps) {
  const { t } = useTranslation();
  const [data, query] = useChangesetListInfiniteQuery(
    spaceId,
    subTab === "open",
  );
  const entries = data.pages.flatMap((page) => page.changesets);

  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(
    function fetchNextPageOnSentinelVisible() {
      if (!sentinel || !query.hasNextPage || query.isFetchingNextPage) {
        return;
      }
      const observer = new IntersectionObserver((observed) => {
        if (observed[0]?.isIntersecting) {
          query.fetchNextPage();
        }
      });
      observer.observe(sentinel);
      return () => observer.disconnect();
    },
    [
      sentinel,
      query.hasNextPage,
      query.isFetchingNextPage,
      query.fetchNextPage,
    ],
  );

  // Open에서는 ingestion만 실제 리뷰 화면이 있다 — relation 상세는 review 2차 몫이라
  // 이번 슬라이스는 목록에 보이기만 하고 클릭은 막는다(surface-inventory.md).
  function handleClick(entry: ChangesetListEntry): (() => void) | undefined {
    if (subTab === "closed") {
      return () => onOpenDetail(entry.id);
    }
    return entry.type === "ingestion"
      ? () => onOpenReview(entry.id)
      : undefined;
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
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <ChangesetListRow
          key={entry.id}
          entry={entry}
          onClick={handleClick(entry)}
        />
      ))}
      {query.hasNextPage ? (
        <div ref={setSentinel} className="flex flex-col gap-2">
          {query.isFetchingNextPage && (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          )}
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
  spaceId: string | undefined;
  onOpenReview: (changesetId: string) => void;
  onOpenDetail: (changesetId: string) => void;
}

export function ChangesPanel({
  spaceId,
  onOpenReview,
  onOpenDetail,
}: ChangesPanelProps) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<ChangesSubTab>("open");

  return (
    <div className="flex w-full flex-col gap-3 py-4">
      <div className="flex w-fit gap-1 rounded-lg bg-surface-card p-1">
        <ChangesSubTabButton
          active={subTab === "open"}
          onClick={() => setSubTab("open")}
        >
          {t("review.tab_open")}
        </ChangesSubTabButton>
        <ChangesSubTabButton
          active={subTab === "closed"}
          onClick={() => setSubTab("closed")}
        >
          {t("review.tab_closed")}
        </ChangesSubTabButton>
      </div>

      {spaceId && (
        <Suspense
          fallback={
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          }
        >
          <ChangesList
            spaceId={spaceId}
            subTab={subTab}
            onOpenReview={onOpenReview}
            onOpenDetail={onOpenDetail}
          />
        </Suspense>
      )}
    </div>
  );
}

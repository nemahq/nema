import { useState } from "react";

import { cn, Skeleton } from "@nema-io/weave";

import { isOpenChangeset } from "@web/features/review/constants";
import { useChangesetListQuery } from "@web/features/review/hooks/useChangesetListQuery";
import type { ChangesetListEntry } from "@web/features/review/types";
import { getErrorMessage } from "@web/lib/getErrorMessage";
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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-fast",
        active
          ? "bg-surface-raised text-fg-primary"
          : "text-fg-tertiary hover:text-fg-secondary",
      )}
    >
      {children}
    </button>
  );
}

interface ChangesPanelProps {
  onOpenReview: (changesetId: string) => void;
  onOpenDetail: (changesetId: string) => void;
}

export function ChangesPanel({
  onOpenReview,
  onOpenDetail,
}: ChangesPanelProps) {
  const { t } = useTranslation();
  const query = useChangesetListQuery();
  const [subTab, setSubTab] = useState<ChangesSubTab>("open");

  if (query.isError) {
    return (
      <p className="py-16 text-center text-sm text-status-error">
        {getErrorMessage(query.error)}
      </p>
    );
  }
  if (!query.data) {
    return (
      <div className="flex w-full flex-col gap-2 py-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const open = query.data.changesets.filter((entry) =>
    isOpenChangeset(entry.status),
  );
  const closed = query.data.changesets.filter(
    (entry) => !isOpenChangeset(entry.status),
  );
  const entries = subTab === "open" ? open : closed;

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

  return (
    <div className="flex w-full flex-col gap-3 py-4">
      <div className="flex w-fit gap-1 rounded-lg bg-surface-card p-1">
        <ChangesSubTabButton
          active={subTab === "open"}
          onClick={() => setSubTab("open")}
        >
          {`Open (${open.length})`}
        </ChangesSubTabButton>
        <ChangesSubTabButton
          active={subTab === "closed"}
          onClick={() => setSubTab("closed")}
        >
          {`Closed (${closed.length})`}
        </ChangesSubTabButton>
      </div>

      {entries.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg-tertiary">
          {subTab === "open"
            ? t("review.changes_empty_open")
            : t("review.changes_empty_closed")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <ChangesetListRow
              key={entry.id}
              entry={entry}
              onClick={handleClick(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { Badge } from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import {
  CHANGESET_TYPE_LABEL,
  isOpenChangeset,
} from "@web/features/review/constants";
import type { ChangesetListEntry } from "@web/features/review/types";
import { summarizeChangesetEffect } from "@web/features/review/utils";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetStatusBadge } from "./ChangesetStatusBadge";

interface ChangesetListRowProps {
  entry: ChangesetListEntry;
  onClick?: () => void;
}

export function ChangesetListRow({ entry, onClick }: ChangesetListRowProps) {
  const { t } = useTranslation();
  const open = isOpenChangeset(entry.status);
  const typeLabel =
    entry.type === "manual" ? entry.type : CHANGESET_TYPE_LABEL[entry.type];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-surface-raised px-3 py-2.5 text-left transition-colors duration-fast enabled:hover:bg-surface-raised-hover disabled:cursor-default"
    >
      <Badge variant="neutral" className="shrink-0">
        {typeLabel}
      </Badge>
      <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
        {entry.number !== null && (
          <span className="text-fg-tertiary">#{entry.number} · </span>
        )}
        {summarizeChangesetEffect(entry.effect, t)}
      </span>
      {entry.reverted && (
        <Badge variant="neutral" className="shrink-0">
          {t("review.status_reverted")}
        </Badge>
      )}
      {!open && (
        <ChangesetStatusBadge status={entry.status} className="shrink-0" />
      )}
      <RelativeTime dateTime={entry.createdAt} className="shrink-0" />
    </button>
  );
}

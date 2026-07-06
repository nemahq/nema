import { Badge, type BadgeVariant } from "@nema-io/weave";

import { ConfirmButton } from "@web/features/dev-harness/components/ConfirmButton";
import type { ChangesetHistoryEntry } from "@web/features/dev-harness/types";
import { formatDateTime } from "@web/features/dev-harness/utils";

const TYPE_LABEL: Record<ChangesetHistoryEntry["type"], string> = {
  ingestion: "넣기",
  manual: "수동",
  revert: "되돌림",
  relation: "관계",
};

const STATUS_META: Record<
  ChangesetHistoryEntry["status"],
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "대기", variant: "warning" },
  applied: { label: "적용", variant: "success" },
  rejected: { label: "거절", variant: "neutral" },
};

function effectLabel(
  statementCount: number,
  relationCount: number,
  sourceCount: number,
): string {
  const parts: string[] = [];
  if (statementCount > 0) {
    parts.push(`진술 ${statementCount}`);
  }
  if (relationCount > 0) {
    parts.push(`관계 ${relationCount}`);
  }
  if (sourceCount > 0) {
    parts.push(`source ${sourceCount}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "변경 없음";
}

interface ChangesetRowProps {
  changesetType: ChangesetHistoryEntry["type"];
  status: ChangesetHistoryEntry["status"];
  statementCount: number;
  relationCount: number;
  sourceCount: number;
  reverted: boolean;
  createdAt: string;
  canRevert: boolean;
  disabled: boolean;
  onRevert: () => void;
}

export function ChangesetRow({
  changesetType,
  status,
  statementCount,
  relationCount,
  sourceCount,
  reverted,
  createdAt,
  canRevert,
  disabled,
  onRevert,
}: ChangesetRowProps) {
  const statusMeta = STATUS_META[status];

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-raised px-3 py-2">
      <Badge variant={statusMeta.variant} className="shrink-0">
        {statusMeta.label}
      </Badge>
      <span className="shrink-0 text-xs font-semibold text-fg-secondary">
        {TYPE_LABEL[changesetType]}
      </span>
      {reverted && (
        <Badge variant="neutral" className="shrink-0">
          되돌려짐
        </Badge>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-fg-tertiary">
        {effectLabel(statementCount, relationCount, sourceCount)}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-fg-tertiary">
        {formatDateTime(createdAt)}
      </span>
      {canRevert && (
        <ConfirmButton
          label="되돌리기"
          disabled={disabled}
          onConfirm={onRevert}
        />
      )}
    </div>
  );
}

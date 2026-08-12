import { Badge, type BadgeVariant } from "@nema-io/weave";

import { SourceDetailBody } from "@web/features/dev-harness/components/SourceDetailBody";
import type { SourceSummary } from "@web/features/dev-harness/types";
import { formatDateTime } from "@web/features/dev-harness/utils";

const STATUS_BADGE: Record<
  SourceSummary["extractionStatus"],
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "추출 중…", variant: "warning" },
  completed: { label: "완료", variant: "success" },
  failed: { label: "실패", variant: "error" },
};

interface SourceCardProps {
  sourceId: string;
  body: string;
  extractionStatus: SourceSummary["extractionStatus"];
  statementCount: number;
  createdAt: string;
  expanded: boolean;
  onToggle: () => void;
}

export function SourceCard({
  sourceId,
  body,
  extractionStatus,
  statementCount,
  createdAt,
  expanded,
  onToggle,
}: SourceCardProps) {
  const statusBadge = STATUS_BADGE[extractionStatus];

  return (
    <div className="rounded-lg border border-border/60 bg-surface-raised">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
      >
        <Badge variant={statusBadge.variant} className="shrink-0">
          {statusBadge.label}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
          {body}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-fg-tertiary">
          진술 {statementCount} · {formatDateTime(createdAt)}
        </span>
      </button>
      {expanded && <SourceDetailBody sourceId={sourceId} />}
    </div>
  );
}

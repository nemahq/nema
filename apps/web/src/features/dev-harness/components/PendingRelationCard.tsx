import { Badge, type BadgeVariant, Button } from "@nema-io/weave";

import type { PendingRelation } from "@web/features/dev-harness/types";
import { formatDateTime } from "@web/features/dev-harness/utils";

const RELATION_META: Record<
  PendingRelation["relationType"],
  { label: string; variant: BadgeVariant }
> = {
  supports: { label: "뒷받침", variant: "info" },
  conflicts: { label: "충돌", variant: "error" },
  replaces: { label: "대체", variant: "warning" },
  resolves: { label: "해소", variant: "success" },
};

type Marking = "apply" | "reject";

interface PendingRelationCardProps {
  relationType: PendingRelation["relationType"];
  stale: boolean;
  createdAt: string;
  fromContent?: string;
  toContent?: string;
  marking?: Marking;
  resultOk?: boolean;
  resultMessage?: string;
  disabled: boolean;
  onMark: (next: Marking | null) => void;
}

export function PendingRelationCard({
  relationType,
  stale,
  createdAt,
  fromContent,
  toContent,
  marking,
  resultOk,
  resultMessage,
  disabled,
  onMark,
}: PendingRelationCardProps) {
  const meta = RELATION_META[relationType];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised px-3 py-2">
      <div className="flex items-center gap-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        {stale && <Badge variant="neutral">끊김</Badge>}
        <span className="flex-1" />
        <span className="text-xs tabular-nums text-fg-tertiary">
          {formatDateTime(createdAt)}
        </span>
      </div>

      <div className="flex flex-col gap-0.5 text-sm text-fg-primary">
        <p className="min-w-0">{fromContent ?? "(가려진 진술)"}</p>
        <span className="text-xs text-fg-tertiary">↓ {meta.label}</span>
        <p className="min-w-0">{toContent ?? "(가려진 진술)"}</p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant={marking === "apply" ? "secondary" : "ghost"}
          disabled={disabled || stale}
          onClick={() => onMark(marking === "apply" ? null : "apply")}
        >
          적용 표시
        </Button>
        <Button
          size="xs"
          variant={marking === "reject" ? "danger" : "ghost"}
          disabled={disabled}
          onClick={() => onMark(marking === "reject" ? null : "reject")}
        >
          거절 표시
        </Button>
        <span className="flex-1" />
        {resultOk && (
          <span className="text-xs text-status-success">처리됨</span>
        )}
        {resultMessage && (
          <span className="text-xs text-status-error">{resultMessage}</span>
        )}
      </div>
    </div>
  );
}

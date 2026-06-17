import { Badge } from "@nema-io/weave";

import { RELATION_META } from "@web/features/dev-harness/relationMeta";
import type { RelationType } from "@web/features/dev-harness/types";
import { formatDateTime } from "@web/features/dev-harness/utils";

interface RelationCardProps {
  relationType: RelationType;
  fromContent: string;
  toContent: string;
  createdAt: string;
}

export function RelationCard({
  relationType,
  fromContent,
  toContent,
  createdAt,
}: RelationCardProps) {
  const meta = RELATION_META[relationType];

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-surface-raised px-3 py-2">
      <div className="flex items-center gap-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        <span className="flex-1" />
        <span className="text-xs tabular-nums text-fg-tertiary">
          {formatDateTime(createdAt)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 text-sm text-fg-primary">
        <p className="min-w-0">{fromContent}</p>
        <span className="text-xs text-fg-tertiary">↓ {meta.label}</span>
        <p className="min-w-0">{toContent}</p>
      </div>
    </div>
  );
}

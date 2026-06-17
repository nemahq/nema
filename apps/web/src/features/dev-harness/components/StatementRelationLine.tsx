import { Badge } from "@nema-io/weave";

import {
  MISSING_STATEMENT_CONTENT,
  RELATION_META,
} from "@web/features/dev-harness/relationMeta";
import type { RelationType } from "@web/features/dev-harness/types";

interface StatementRelationLineProps {
  relationType: RelationType;
  arrow: string;
  counterpartContent: string | null;
}

export function StatementRelationLine({
  relationType,
  arrow,
  counterpartContent,
}: StatementRelationLineProps) {
  const meta = RELATION_META[relationType];

  return (
    <div className="flex items-start gap-1.5">
      <Badge variant={meta.variant} className="shrink-0">
        {meta.label}
      </Badge>
      <span className="shrink-0 text-xs text-fg-tertiary">{arrow}</span>
      <span className="min-w-0 flex-1 text-xs text-fg-tertiary">
        {counterpartContent ?? MISSING_STATEMENT_CONTENT}
      </span>
    </div>
  );
}

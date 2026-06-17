import { Badge } from "@nema-io/weave";

import { RELATION_META } from "@web/features/dev-harness/relationMeta";
import type { RelationType } from "@web/features/dev-harness/types";

interface StatementRelationLineProps {
  relationType: RelationType;
  // 상대 진술이 놓인 방향: → 이 진술이 from, ← 이 진술이 to, ↔ 무방향(충돌)
  arrow: string;
  counterpartContent: string;
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
        {counterpartContent}
      </span>
    </div>
  );
}

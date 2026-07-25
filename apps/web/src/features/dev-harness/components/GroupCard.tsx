import type { ReactNode } from "react";

import { formatDateTime } from "@web/features/dev-harness/utils";

interface GroupCardProps {
  sourceCreatedAt: string;
  touchedStatementCount: number;
  totalStatementCount: number;
  maxScore: number;
  children: ReactNode;
}

export function GroupCard({
  sourceCreatedAt,
  touchedStatementCount,
  totalStatementCount,
  maxScore,
  children,
}: GroupCardProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-raised">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-semibold text-fg-secondary">
          원문 · {formatDateTime(sourceCreatedAt)}
        </span>
        <span className="flex-1" />
        <span className="text-xs tabular-nums text-fg-tertiary">
          닿음 {touchedStatementCount}/{totalStatementCount} · 최고{" "}
          {maxScore.toFixed(3)}
        </span>
      </div>
      <ul className="flex flex-col gap-1 border-t border-border/40 px-3 py-2">
        {children}
      </ul>
    </div>
  );
}

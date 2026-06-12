import { Badge, type BadgeVariant } from "@nema-io/weave";

import type { SourceStatement } from "@web/features/dev-harness/types";

const TYPE_BADGE: Record<
  SourceStatement["type"],
  { label: string; variant: BadgeVariant }
> = {
  claim: { label: "주장", variant: "info" },
  question: { label: "질문", variant: "warning" },
  todo: { label: "할 일", variant: "success" },
};

const CONFIDENCE_LABEL: Record<
  NonNullable<SourceStatement["confidence"]>,
  string
> = {
  certain: "확정",
  guess: "추측",
};

interface StatementRowProps {
  type: SourceStatement["type"];
  confidence: SourceStatement["confidence"];
  content: string;
  meta?: string;
}

export function StatementRow({
  type,
  confidence,
  content,
  meta,
}: StatementRowProps) {
  const typeBadge = TYPE_BADGE[type];

  return (
    <li className="flex items-start gap-2 rounded-md border border-border/40 bg-surface-card px-3 py-2">
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
        {confidence && (
          <Badge variant="neutral">{CONFIDENCE_LABEL[confidence]}</Badge>
        )}
      </div>
      <p className="min-w-0 flex-1 text-sm text-fg-primary">{content}</p>
      {meta && (
        <span className="shrink-0 pt-0.5 text-xs tabular-nums text-fg-tertiary">
          {meta}
        </span>
      )}
    </li>
  );
}

import { Badge, type BadgeVariant } from "@nema-io/weave";

import { StatementRow } from "@web/features/dev-harness/components/StatementRow";
import { useSourceQuery } from "@web/features/dev-harness/hooks/useSourceQueries";
import type {
  SourceStatement,
  SourceSummary,
} from "@web/features/dev-harness/types";
import { formatDateTime } from "@web/features/dev-harness/utils";

const STATUS_BADGE: Record<
  SourceSummary["extractionStatus"],
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "추출 중…", variant: "warning" },
  completed: { label: "완료", variant: "success" },
  failed: { label: "실패", variant: "error" },
};

// 검색은 임베딩 완료된 진술만 닿는다 — 완료 전 상태를 진술 옆에 표시 (ingestion-design 5장)
function ingestionMetaLabel(
  status: SourceStatement["ingestionStatus"],
): string | undefined {
  if (status === "pending") {
    return "임베딩 대기";
  }
  if (status === "failed") {
    return "임베딩 실패";
  }
  return undefined;
}

interface SourceDetailBodyProps {
  sourceId: string;
}

function SourceDetailBody({ sourceId }: SourceDetailBodyProps) {
  const { data: source } = useSourceQuery({ sourceId });

  if (!source) {
    return <p className="px-3 py-2 text-xs text-fg-tertiary">불러오는 중…</p>;
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border/40 px-3 py-2">
      <details>
        <summary className="cursor-pointer text-xs text-fg-tertiary">
          원문 보기
        </summary>
        <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-raised p-2 text-xs text-fg-secondary">
          {source.body}
        </pre>
      </details>

      {source.extractionStatus === "pending" && (
        <p className="text-xs text-fg-tertiary">진술로 쪼개는 중…</p>
      )}
      {source.extractionStatus === "failed" && source.errorMessage && (
        <p className="text-xs text-status-error">{source.errorMessage}</p>
      )}
      {source.extractionStatus === "completed" &&
        source.statements.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            추출된 진술 없음 — 노이즈로 판정된 글
          </p>
        )}

      {source.statements.length > 0 && (
        <ul className="flex flex-col gap-1">
          {source.statements.map((statement) => (
            <StatementRow
              key={statement.id}
              type={statement.type}
              confidence={statement.confidence}
              content={statement.content}
              meta={ingestionMetaLabel(statement.ingestionStatus)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface SourceCardProps {
  source: SourceSummary;
  expanded: boolean;
  onToggle: () => void;
}

export function SourceCard({ source, expanded, onToggle }: SourceCardProps) {
  const statusBadge = STATUS_BADGE[source.extractionStatus];

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
          {source.body}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-fg-tertiary">
          진술 {source.statementCount} · {formatDateTime(source.createdAt)}
        </span>
      </button>
      {expanded && <SourceDetailBody sourceId={source.id} />}
    </div>
  );
}

import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { StatementRow } from "@web/features/dev-harness/components/StatementRow";
import { useSourceSuspenseQuery } from "@web/features/dev-harness/hooks/useSourceQuery";
import type { SourceStatement } from "@web/features/dev-harness/types";
import { getErrorMessage } from "@web/lib/getErrorMessage";

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

function SourceDetailBodyContent({ sourceId }: SourceDetailBodyProps) {
  const [source, sourceQuery] = useSourceSuspenseQuery({ sourceId });

  return (
    <div className="flex flex-col gap-2 border-t border-border/40 px-3 py-2">
      {sourceQuery.isError && (
        <p className="text-xs text-status-error">
          상태 갱신 실패 — {getErrorMessage(sourceQuery.error)}
        </p>
      )}

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
      {source.extractionStatus === "failed" && (
        <p className="text-xs text-status-error">
          {source.errorMessage ?? "추출 실패 — 원인 미기록"}
        </p>
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

// 원본 하나의 조회 실패가 조종석 전체를 날리지 않게 카드 단위로 막는다
export function SourceDetailBody({ sourceId }: SourceDetailBodyProps) {
  return (
    <ErrorBoundary
      boundaryName="dev-harness-source-detail"
      fallbackRender={({ error }) => (
        <p className="border-t border-border/40 px-3 py-2 text-xs text-status-error">
          불러오기 실패 — {getErrorMessage(error)}
        </p>
      )}
    >
      <Suspense
        fallback={
          <p className="px-3 py-2 text-xs text-fg-tertiary">불러오는 중…</p>
        }
      >
        <SourceDetailBodyContent sourceId={sourceId} />
      </Suspense>
    </ErrorBoundary>
  );
}

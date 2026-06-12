import { Suspense } from "react";

import { SourceCard } from "@web/features/dev-harness/components/SourceCard";
import { useSourceListSuspenseQuery } from "@web/features/dev-harness/hooks/useSourceListQuery";
import { getErrorMessage } from "@web/lib/getErrorMessage";

interface SourceHistoryListProps {
  expandedSourceId: string | null;
  onToggleSource: (sourceId: string) => void;
}

function SourceHistoryListContent({
  expandedSourceId,
  onToggleSource,
}: SourceHistoryListProps) {
  const [sourceList, sourceListQuery] = useSourceListSuspenseQuery();

  return (
    <>
      <h3 className="mt-2 text-xs font-semibold text-fg-tertiary">
        던진 글 ({sourceList.sources.length})
      </h3>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {sourceListQuery.isError && (
          <p className="text-xs text-status-error">
            목록 갱신 실패 — {getErrorMessage(sourceListQuery.error)}
          </p>
        )}
        {sourceList.sources.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            아직 없음 — 위에서 첫 글을 던져보기
          </p>
        )}
        {sourceList.sources.map((source) => (
          <SourceCard
            key={source.id}
            sourceId={source.id}
            body={source.body}
            extractionStatus={source.extractionStatus}
            statementCount={source.statementCount}
            createdAt={source.createdAt}
            expanded={source.id === expandedSourceId}
            onToggle={() => onToggleSource(source.id)}
          />
        ))}
      </div>
    </>
  );
}

export function SourceHistoryList({
  expandedSourceId,
  onToggleSource,
}: SourceHistoryListProps) {
  return (
    <Suspense
      fallback={<p className="mt-2 text-xs text-fg-tertiary">불러오는 중…</p>}
    >
      <SourceHistoryListContent
        expandedSourceId={expandedSourceId}
        onToggleSource={onToggleSource}
      />
    </Suspense>
  );
}

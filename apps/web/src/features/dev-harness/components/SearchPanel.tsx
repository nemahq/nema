import { useState } from "react";

import { Button } from "@nema-io/weave";

import { GroupCard } from "@web/features/dev-harness/components/GroupCard";
import { StatementRow } from "@web/features/dev-harness/components/StatementRow";
import { useStatementSearchQuery } from "@web/features/dev-harness/hooks/useStatementSearchQuery";
import type { StatementGroup } from "@web/features/dev-harness/types";
import { getErrorMessage } from "@web/lib/getErrorMessage";

function maxScoreOf(statements: StatementGroup["statements"]): number {
  return Math.max(...statements.map((s) => s.score));
}

export function SearchPanel() {
  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const statementSearchQuery = useStatementSearchQuery({
    query: submittedQuery,
  });

  function handleSubmit() {
    const trimmedQuery = queryInput.trim();
    if (trimmedQuery) {
      setSubmittedQuery(trimmedQuery);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">검색</h2>

      <div className="flex gap-2">
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            }
          }}
          placeholder="자연어로 질문 — 예: 결제는 왜 토스로 정했지?"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-strong"
        />
        <Button
          size="xs"
          className="self-center"
          onClick={handleSubmit}
          disabled={!queryInput.trim() || statementSearchQuery.isFetching}
        >
          검색
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {statementSearchQuery.isFetching && (
          <p className="text-xs text-fg-tertiary">검색 중…</p>
        )}
        {statementSearchQuery.isError && (
          <p className="text-xs text-status-error">
            {getErrorMessage(statementSearchQuery.error)}
          </p>
        )}
        {statementSearchQuery.data?.groups.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            닿은 진술 없음 — 다른 말로 물어보거나 글을 더 던져보기
          </p>
        )}
        {statementSearchQuery.data?.groups.map((group) => (
          <GroupCard
            key={group.key.sourceId}
            sourceCreatedAt={group.key.sourceCreatedAt}
            touchedStatementCount={group.statements.length}
            totalStatementCount={group.totalStatementCount}
            maxScore={maxScoreOf(group.statements)}
          >
            {group.statements.map((statement) => (
              <StatementRow
                key={statement.id}
                type={statement.type}
                confidence={statement.confidence}
                content={statement.content}
                meta={statement.score.toFixed(3)}
              />
            ))}
          </GroupCard>
        ))}
      </div>
    </section>
  );
}

import { useState } from "react";

import { Button } from "@nema-io/weave";

import { StatementRow } from "@web/features/dev-harness/components/StatementRow";
import { useStatementSearchQuery } from "@web/features/dev-harness/hooks/useStatementSearchQuery";
import type { StatementGroup } from "@web/features/dev-harness/types";
import { formatDateTime } from "@web/features/dev-harness/utils";
import { getErrorMessage } from "@web/lib/getErrorMessage";

interface GroupCardProps {
  group: StatementGroup;
}

function GroupCard({ group }: GroupCardProps) {
  const maxScore = Math.max(...group.statements.map((s) => s.score));

  return (
    <div className="rounded-lg border border-border/60 bg-surface-raised">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-semibold text-fg-secondary">
          원본 · {formatDateTime(group.key.sourceCreatedAt)}
        </span>
        <span className="flex-1" />
        <span className="text-xs tabular-nums text-fg-tertiary">
          닿음 {group.statements.length}/{group.totalStatementCount} · 최고{" "}
          {maxScore.toFixed(3)}
        </span>
      </div>
      <ul className="flex flex-col gap-1 border-t border-border/40 px-3 py-2">
        {group.statements.map((statement) => (
          <StatementRow
            key={statement.id}
            type={statement.type}
            confidence={statement.confidence}
            content={statement.content}
            meta={statement.score.toFixed(3)}
          />
        ))}
      </ul>
    </div>
  );
}

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const search = useStatementSearchQuery({ query: submittedQuery });

  function handleSubmit() {
    const trimmed = query.trim();
    if (trimmed) {
      setSubmittedQuery(trimmed);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">검색</h2>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
          disabled={!query.trim() || search.isFetching}
        >
          검색
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {search.isFetching && (
          <p className="text-xs text-fg-tertiary">검색 중…</p>
        )}
        {search.isError && (
          <p className="text-xs text-status-error">
            {getErrorMessage(search.error)}
          </p>
        )}
        {search.data?.groups.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            닿은 진술 없음 — 다른 말로 물어보거나 글을 더 던져보기
          </p>
        )}
        {search.data?.groups.map((group) => (
          <GroupCard key={group.key.sourceId} group={group} />
        ))}
      </div>
    </section>
  );
}

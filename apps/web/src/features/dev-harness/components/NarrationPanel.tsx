import { GroupCard } from "@web/features/dev-harness/components/GroupCard";
import { RelationMarkers } from "@web/features/dev-harness/components/RelationMarkers";
import { StatementRow } from "@web/features/dev-harness/components/StatementRow";
import { useNarration } from "@web/features/dev-harness/hooks/useNarration";
import type { NarrationEvidence } from "@web/features/dev-harness/types";

// 매칭 못 한 상대 진술은 ID 앞자리만 노출 — 식별엔 충분하고 전체 ID는 잡음
const COUNTERPART_ID_PREFIX_LENGTH = 8;

type EvidenceGroup = NarrationEvidence["groups"][number];

function maxScoreOf(statements: EvidenceGroup["statements"]): number {
  return Math.max(...statements.map((s) => s.score));
}

function buildContentById(evidence: NarrationEvidence): Map<string, string> {
  const contentById = new Map<string, string>();
  for (const group of evidence.groups) {
    for (const statement of group.statements) {
      contentById.set(statement.id, statement.content);
    }
  }
  for (const related of evidence.relatedStatements) {
    contentById.set(related.id, related.content);
  }
  return contentById;
}

interface NarrationPanelProps {
  query: string;
}

// 해설은 검색과 같은 질의를 공유한다 — 같은 질의가 찾기엔 묶음을, 해설엔 근거 위 산문을 낸다.
export function NarrationPanel({ query }: NarrationPanelProps) {
  const { evidence, prose, error, active } = useNarration(query);

  const contentById = evidence
    ? buildContentById(evidence)
    : new Map<string, string>();

  function resolveCounterpartLabel(id: string): string {
    return (
      contentById.get(id) ?? `#${id.slice(0, COUNTERPART_ID_PREFIX_LENGTH)}`
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold text-fg-primary">해설</h2>

      {!active && (
        <p className="text-xs text-fg-tertiary">
          왼쪽 위 질의창에 물으면 같은 질의로 해설을 만든다
        </p>
      )}
      {error && <p className="text-xs text-status-error">{error}</p>}
      {active && !evidence && !error && (
        <p className="text-xs text-fg-tertiary">근거 모으는 중…</p>
      )}

      {prose && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-primary">
          {prose}
        </p>
      )}
      {active && evidence && !prose && !error && (
        <p className="text-xs text-fg-tertiary">근거 위에 해설 쓰는 중…</p>
      )}

      {evidence && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-fg-tertiary">근거</h3>
          {evidence.groups.length === 0 && (
            <p className="text-xs text-fg-tertiary">
              닿은 근거 없음 — 모르면 모른다고 두는 자리
            </p>
          )}
          {evidence.groups.map((group) => (
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
                  markers={
                    <RelationMarkers
                      supersededBy={statement.supersededBy}
                      conflictsWith={statement.conflictsWith}
                      resolvedBy={statement.resolvedBy}
                      resolveLabel={resolveCounterpartLabel}
                    />
                  }
                />
              ))}
            </GroupCard>
          ))}

          {evidence.relatedStatements.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold text-fg-tertiary">
                관계로 닿은 근거
              </h3>
              {evidence.relatedStatements.map((related) => (
                <p
                  key={related.id}
                  className="rounded-md border border-border/40 bg-surface-card px-3 py-2 text-sm text-fg-secondary"
                >
                  {related.content}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

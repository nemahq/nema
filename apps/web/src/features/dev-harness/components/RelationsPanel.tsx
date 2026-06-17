import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { RelationCard } from "@web/features/dev-harness/components/RelationCard";
import { useActiveRelationsSuspenseQuery } from "@web/features/dev-harness/hooks/useActiveRelationsQuery";
import { RELATION_META } from "@web/features/dev-harness/relationMeta";
import type {
  ActiveRelation,
  RelationType,
} from "@web/features/dev-harness/types";
import { getErrorMessage } from "@web/lib/getErrorMessage";

// supports를 맨 앞에 — 과잉이 가장 잘 드러나야 하는 종류라 먼저 본다.
const RELATION_ORDER = [
  "supports",
  "conflicts",
  "replaces",
  "resolves",
] as const satisfies RelationType[];

function groupByType(
  relations: ActiveRelation[],
): Record<RelationType, ActiveRelation[]> {
  const groups: Record<RelationType, ActiveRelation[]> = {
    supports: [],
    conflicts: [],
    replaces: [],
    resolves: [],
  };
  for (const relation of relations) {
    groups[relation.type].push(relation);
  }
  return groups;
}

function RelationsPanelContent() {
  const [{ relations }] = useActiveRelationsSuspenseQuery();
  const byType = groupByType(relations);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">
        관계 ({relations.length})
      </h2>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {relations.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            아직 적용된 관계 없음 — 글을 더 던지면 엔진이 진술을 잇는다
          </p>
        )}
        {RELATION_ORDER.map((type) => {
          const list = byType[type];
          if (list.length === 0) {
            return null;
          }
          return (
            <div key={type} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-fg-tertiary">
                {RELATION_META[type].label} {list.length}
              </h3>
              {list.map((relation) => (
                <RelationCard
                  key={relation.id}
                  relationType={relation.type}
                  fromContent={relation.from.content}
                  toContent={relation.to.content}
                  createdAt={relation.createdAt}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RelationsPanel() {
  return (
    <ErrorBoundary
      boundaryName="dev-harness-relations"
      fallbackRender={({ error }) => (
        <p className="p-4 text-xs text-status-error">
          관계 불러오기 실패 — {getErrorMessage(error)}
        </p>
      )}
    >
      <Suspense
        fallback={<p className="p-4 text-xs text-fg-tertiary">불러오는 중…</p>}
      >
        <RelationsPanelContent />
      </Suspense>
    </ErrorBoundary>
  );
}

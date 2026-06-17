import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { ChangesetRow } from "@web/features/dev-harness/components/ChangesetRow";
import { useChangesetListSuspenseQuery } from "@web/features/dev-harness/hooks/useChangesetListQuery";
import { useInterventionInvalidation } from "@web/features/dev-harness/hooks/useInterventionInvalidation";
import { useRevertChangeset } from "@web/features/dev-harness/hooks/useRevertChangeset";
import { getErrorMessage } from "@web/lib/getErrorMessage";

function HistoryPanelContent() {
  const [{ changesets }] = useChangesetListSuspenseQuery();
  const revertChangeset = useRevertChangeset();
  const invalidate = useInterventionInvalidation();

  function handleRevert(changesetId: string) {
    revertChangeset.mutate({ changesetId }, { onSuccess: invalidate });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">
        이력 ({changesets.length})
      </h2>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {changesets.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            아직 변경 없음 — 넣기·관계 해소가 쌓이면 여기 기록된다
          </p>
        )}
        {changesets.map((changeset) => (
          <ChangesetRow
            key={changeset.id}
            changesetType={changeset.type}
            status={changeset.status}
            statementCount={changeset.effect.statement}
            relationCount={changeset.effect.relation}
            sourceCount={changeset.effect.source}
            reverted={changeset.reverted}
            createdAt={changeset.createdAt}
            canRevert={changeset.status === "applied" && !changeset.reverted}
            disabled={revertChangeset.isPending}
            onRevert={() => handleRevert(changeset.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function HistoryPanel() {
  return (
    <ErrorBoundary
      boundaryName="dev-harness-history"
      fallbackRender={({ error }) => (
        <p className="p-4 text-xs text-status-error">
          이력 불러오기 실패 — {getErrorMessage(error)}
        </p>
      )}
    >
      <Suspense
        fallback={<p className="p-4 text-xs text-fg-tertiary">불러오는 중…</p>}
      >
        <HistoryPanelContent />
      </Suspense>
    </ErrorBoundary>
  );
}

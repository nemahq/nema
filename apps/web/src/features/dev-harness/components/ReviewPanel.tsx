import { Suspense, useState } from "react";

import { Button } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { PendingRelationCard } from "@web/features/dev-harness/components/PendingRelationCard";
import { useApplyPendingRelation } from "@web/features/dev-harness/hooks/useApplyPendingRelation";
import { useInterventionInvalidation } from "@web/features/dev-harness/hooks/useInterventionInvalidation";
import { usePendingRelationListSuspenseQuery } from "@web/features/dev-harness/hooks/usePendingRelationListQuery";
import { useRejectPendingRelation } from "@web/features/dev-harness/hooks/useRejectPendingRelation";
import { getErrorMessage } from "@web/lib/getErrorMessage";

type Marking = "apply" | "reject";
type SubmitResult = { ok: true } | { ok: false; message: string };

function ReviewPanelContent() {
  const [{ proposals }] = usePendingRelationListSuspenseQuery();
  const [markings, setMarkings] = useState<Map<string, Marking>>(new Map());
  const [results, setResults] = useState<Map<string, SubmitResult>>(new Map());
  const [summary, setSummary] = useState<{ ok: number; fail: number } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const applyRelation = useApplyPendingRelation();
  const rejectRelation = useRejectPendingRelation();
  const invalidate = useInterventionInvalidation();

  function handleMark(changesetId: string, next: Marking | null) {
    setMarkings((prev) => {
      const updated = new Map(prev);
      if (next === null) {
        updated.delete(changesetId);
      } else {
        updated.set(changesetId, next);
      }
      return updated;
    });
  }

  // 배치는 백엔드 트랜잭션이 없어 개별 mutation을 순차 실행한다 — 부분 실패가 가능하므로
  // 항목별 결과를 남기고 성공분만 마킹에서 비운다(실패분은 카드에 에러와 함께 유지).
  async function handleSubmit() {
    setSubmitting(true);
    const nextResults = new Map<string, SubmitResult>();
    const remaining = new Map<string, Marking>();
    let ok = 0;
    let fail = 0;

    for (const [changesetId, action] of markings) {
      try {
        if (action === "apply") {
          await applyRelation.mutateAsync({ changesetId });
        } else {
          await rejectRelation.mutateAsync({ changesetId });
        }
        nextResults.set(changesetId, { ok: true });
        ok += 1;
      } catch (error) {
        nextResults.set(changesetId, {
          ok: false,
          message: getErrorMessage(error),
        });
        remaining.set(changesetId, action);
        fail += 1;
      }
    }

    setResults(nextResults);
    setMarkings(remaining);
    setSummary({ ok, fail });
    await invalidate();
    setSubmitting(false);
  }

  const markedCount = markings.size;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-fg-primary">
          검토함 ({proposals.length})
        </h2>
        <span className="flex-1" />
        <Button
          size="xs"
          onClick={handleSubmit}
          disabled={markedCount === 0 || submitting}
        >
          표시한 {markedCount}개 제출
        </Button>
      </div>

      {summary && (
        <p className="text-xs text-fg-tertiary">
          직전 제출 — 성공 {summary.ok} · 실패 {summary.fail}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {proposals.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            검토할 제안 없음 — 글을 더 던지면 엔진이 관계를 올린다
          </p>
        )}
        {proposals.map((proposal) => {
          const result = results.get(proposal.changesetId);
          return (
            <PendingRelationCard
              key={proposal.changesetId}
              relationType={proposal.relationType}
              stale={proposal.stale}
              createdAt={proposal.createdAt}
              fromContent={proposal.from?.content}
              toContent={proposal.to?.content}
              marking={markings.get(proposal.changesetId)}
              resultOk={result?.ok === true}
              resultMessage={result && !result.ok ? result.message : undefined}
              disabled={submitting}
              onMark={(next) => handleMark(proposal.changesetId, next)}
            />
          );
        })}
      </div>
    </section>
  );
}

export function ReviewPanel() {
  return (
    <ErrorBoundary
      boundaryName="dev-harness-review"
      fallbackRender={({ error }) => (
        <p className="p-4 text-xs text-status-error">
          검토함 불러오기 실패 — {getErrorMessage(error)}
        </p>
      )}
    >
      <Suspense
        fallback={<p className="p-4 text-xs text-fg-tertiary">불러오는 중…</p>}
      >
        <ReviewPanelContent />
      </Suspense>
    </ErrorBoundary>
  );
}

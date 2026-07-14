import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { ReferenceRow } from "@web/features/dev-harness/components/ReferenceRow";
import { useReferenceListSuspenseQuery } from "@web/features/dev-harness/hooks/useReferenceListQuery";
import { getErrorMessage } from "@web/lib/getErrorMessage";

function ReferencesPanelContent() {
  const [{ references }] = useReferenceListSuspenseQuery();

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">
        레퍼런스 ({references.length})
      </h2>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {references.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            아직 만들어진 레퍼런스 없음
          </p>
        )}
        {references.map((reference) => (
          <ReferenceRow key={reference.id} reference={reference} />
        ))}
      </ul>
    </section>
  );
}

export function ReferencesPanel() {
  return (
    <ErrorBoundary
      boundaryName="dev-harness-references"
      fallbackRender={({ error }) => (
        <p className="p-4 text-xs text-status-error">
          레퍼런스 불러오기 실패 — {getErrorMessage(error)}
        </p>
      )}
    >
      <Suspense
        fallback={<p className="p-4 text-xs text-fg-tertiary">불러오는 중…</p>}
      >
        <ReferencesPanelContent />
      </Suspense>
    </ErrorBoundary>
  );
}

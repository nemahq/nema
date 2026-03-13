import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import type { useCancelDraft } from "@web/features/session/hooks/useCancelDraft";
import type { useSaveDraft } from "@web/features/session/hooks/useSaveDraft";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";

import { DraftPanel } from "./DraftPanel";

function DraftPanelSectionContent({
  sessionId,
  saveDraft,
  cancelDraft,
}: DraftPanelSectionProps) {
  const draft = useSessionDraft({ sessionId });

  if (!draft) {
    return null;
  }

  return (
    <DraftPanel
      draft={draft}
      onSave={() => saveDraft.mutate({ sessionId })}
      onCancel={() => cancelDraft.mutate({ sessionId })}
      isPending={saveDraft.isPending}
    />
  );
}

interface DraftPanelSectionProps {
  sessionId: string;
  saveDraft: ReturnType<typeof useSaveDraft>;
  cancelDraft: ReturnType<typeof useCancelDraft>;
}

export function DraftPanelSection(props: DraftPanelSectionProps) {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense>
        <DraftPanelSectionContent {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

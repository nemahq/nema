import { Suspense } from "react";

import type { useDraftActions } from "@web/features/session/hooks/useDraftActions";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";

import { DraftPanel } from "./DraftPanel";

function DraftPanelSectionContent({
  sessionId,
  draftActions,
}: DraftPanelSectionProps) {
  const draft = useSessionDraft({ sessionId });

  if (!draft) {
    return null;
  }

  return (
    <DraftPanel
      draft={draft}
      onSave={() => draftActions.save.mutate({ sessionId })}
      onCancel={() => draftActions.cancel.mutate({ sessionId })}
      isPending={draftActions.save.isPending}
    />
  );
}

interface DraftPanelSectionProps {
  sessionId: string;
  draftActions: ReturnType<typeof useDraftActions>;
}

export function DraftPanelSection(props: DraftPanelSectionProps) {
  return (
    <Suspense>
      <DraftPanelSectionContent {...props} />
    </Suspense>
  );
}

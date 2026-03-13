import type { useDraftActions } from "@web/features/session/hooks/useDraftActions";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";

import { DraftPanel } from "./DraftPanel";

export function DraftPanelSection({
  sessionId,
  draftActions,
}: {
  sessionId: string;
  draftActions: ReturnType<typeof useDraftActions>;
}) {
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

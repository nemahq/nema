import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { DraftTabContent } from "@web/features/session/components/DraftTabContent";
import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";

import { useCancelDraft } from "./useCancelDraft";
import { useSessionId } from "./useSessionId";
import { useSessionSuspenseQuery } from "./useSessionQuery";

export function useDraftTab(): TabbedPanelTab | undefined {
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });
  const { streamingPhase } = useChatLifecycle();
  const cancelDraft = useCancelDraft({ sessionId });

  const hasDraft = !!(session.draft || streamingPhase === "draft");

  if (!hasDraft) {
    return undefined;
  }

  return {
    id: "draft",
    labelKey: "session.draft",
    content: <DraftTabContent />,
    onClose: () => cancelDraft.mutate({ sessionId }),
  };
}

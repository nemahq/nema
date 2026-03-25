import { FileText } from "@nema-io/weave/icons";

import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { DraftTabContent } from "@web/features/session/components/DraftTabContent";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";

import { useCancelDraft } from "./useCancelDraft";
import { useSessionId } from "./useSessionId";
import { useSessionSuspenseQuery } from "./useSessionQuery";

export function useDraftTab(): TabbedPanelTab | undefined {
  const sessionId = useSessionId();
  const [draft] = useSessionSuspenseQuery(
    { sessionId },
    { select: (session) => session.draft },
  );
  const { streamingPhase } = useChatStream();
  const cancelDraft = useCancelDraft({ sessionId });

  const hasDraft = !!(draft || streamingPhase === "draft");

  if (!hasDraft) {
    return undefined;
  }

  return {
    id: "draft",
    labelKey: "session.draft",
    icon: FileText,
    content: <DraftTabContent />,
    onClose: () => cancelDraft.mutate({ sessionId }),
  };
}

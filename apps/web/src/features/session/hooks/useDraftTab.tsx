import { FileText } from "@nema-io/weave/icons";

import { DraftTabContent } from "@web/features/session/components/DraftTabContent";
import type { TabbedPanelTab } from "@web/features/session/components/TabbedPanel";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";

import { useSessionDraft } from "./useSessionDraft";
import { useSessionId } from "./useSessionId";

export function useDraftTab(): TabbedPanelTab | undefined {
  const sessionId = useSessionId();
  const draft = useSessionDraft({ sessionId });
  const { streamingPhase } = useChatStream();

  const hasDraft = !!(draft || streamingPhase === "draft");

  if (!hasDraft) {
    return undefined;
  }

  return {
    id: "draft",
    labelKey: "session.draft",
    icon: FileText,
    content: <DraftTabContent />,
  };
}

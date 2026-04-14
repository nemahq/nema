import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { StreamingRetrievalTabContent } from "@web/features/session/components/StreamingRetrievalTabContent";
import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";

export function useStreamingRetrievalTab(): TabbedPanelTab | undefined {
  const { streamingPhase } = useChatLifecycle();

  const isActive =
    streamingPhase === "searching" || streamingPhase === "retrieval";

  if (!isActive) {
    return undefined;
  }

  return {
    id: "streaming-retrieval",
    labelKey: "session.retrieval_generating",
    content: <StreamingRetrievalTabContent />,
  };
}

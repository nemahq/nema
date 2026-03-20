import { Search } from "@nema-io/weave/icons";

import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { RetrievalTabContent } from "@web/features/session/components/RetrievalTabContent";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";

import { useDismissRetrieval } from "./useDismissRetrieval";
import { useSessionId } from "./useSessionId";
import { useSessionRetrieval } from "./useSessionRetrieval";

export function useRetrievalTab(): TabbedPanelTab | undefined {
  const sessionId = useSessionId();
  const retrieval = useSessionRetrieval({ sessionId });
  const { streamingPhase } = useChatStream();
  const dismissRetrieval = useDismissRetrieval({ sessionId });

  const hasRetrieval = !!(retrieval || streamingPhase === "retrieval");

  if (!hasRetrieval) {
    return undefined;
  }

  return {
    id: "retrieval",
    labelKey: "session.retrieval",
    icon: Search,
    content: <RetrievalTabContent />,
    onClose: () => dismissRetrieval.mutate({ sessionId }),
  };
}

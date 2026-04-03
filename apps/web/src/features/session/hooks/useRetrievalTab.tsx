import { useCallback, useState } from "react";

import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { RetrievalTabContent } from "@web/features/session/components/RetrievalTabContent";
import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";

import { useSessionId } from "./useSessionId";
import { useSessionSuspenseQuery } from "./useSessionQuery";

export function useRetrievalTab(): TabbedPanelTab | undefined {
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });
  const { streamingPhase, searchResultDocs, clearSearchResults } =
    useChatLifecycle();
  const [dismissed, setDismissed] = useState(false);

  const isStreamingRetrieval =
    streamingPhase === "searching" || streamingPhase === "retrieval";

  // 새 스트리밍이 시작되면 dismiss 상태 초기화
  if (isStreamingRetrieval && dismissed) {
    setDismissed(false);
  }

  const handleClose = useCallback(() => {
    clearSearchResults();
    setDismissed(true);
  }, [clearSearchResults]);

  const latestRetrieval = session.retrievals[0] ?? null;

  if (
    dismissed ||
    (!latestRetrieval && !isStreamingRetrieval && searchResultDocs.length === 0)
  ) {
    return undefined;
  }

  return {
    id: "retrieval",
    labelKey: "session.retrieval",
    content: <RetrievalTabContent />,
    onClose: handleClose,
  };
}

import { useEffect, useMemo } from "react";

import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { RetrievalTabContent } from "@web/features/session/components/RetrievalTabContent";
import { StreamingRetrievalTabContent } from "@web/features/session/components/StreamingRetrievalTabContent";
import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useContentTab } from "@web/features/session/contexts/ContentTabContext";
import { truncate } from "@web/utils/truncate";

import { useSessionId } from "./useSessionId";
import { useSessionSuspenseQuery } from "./useSessionQuery";

const LABEL_MAX_LENGTH = 20;

export function useRetrievalTabs(): TabbedPanelTab[] {
  const { openRetrievalTabs, closeRetrievalTab } = useContentTab();
  const { streamingPhase } = useChatLifecycle();
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });
  const { retrievals } = session;

  const isStreaming =
    streamingPhase === "searching" || streamingPhase === "retrieval";

  useEffect(
    function cleanupOrphanedTabsOnSessionEntry() {
      const retrievalIds = new Set(retrievals.map((r) => r.id));
      for (const id of openRetrievalTabs) {
        if (!retrievalIds.has(id)) {
          closeRetrievalTab(id);
        }
      }
    },
    [sessionId],
  );

  return useMemo(() => {
    const tabs: TabbedPanelTab[] = [];

    if (isStreaming) {
      tabs.push({
        id: "streaming-retrieval",
        labelKey: "session.retrieval_generating",
        content: <StreamingRetrievalTabContent />,
      });
    }

    const retrievalMap = new Map(retrievals.map((r) => [r.id, r]));

    for (const retrievalId of openRetrievalTabs) {
      const retrieval = retrievalMap.get(retrievalId);
      if (!retrieval) {
        continue;
      }
      tabs.push({
        id: `retrieval-${retrievalId}`,
        label: truncate(retrieval.query, LABEL_MAX_LENGTH),
        content: <RetrievalTabContent retrievalId={retrievalId} />,
        onClose: () => closeRetrievalTab(retrievalId),
      });
    }

    return tabs;
  }, [isStreaming, openRetrievalTabs, retrievals, closeRetrievalTab]);
}

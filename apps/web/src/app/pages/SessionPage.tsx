import { useEffect, useRef } from "react";

import { ChatPanel } from "@web/features/session/components/ChatPanel";
import { ContentPanel } from "@web/features/session/components/ContentPanel";
import {
  ChatLifecycleProvider,
  useChatLifecycle,
} from "@web/features/session/contexts/ChatLifecycleContext";
import {
  ContentTabProvider,
  useContentTab,
} from "@web/features/session/contexts/ContentTabContext";

function AutoOpenRetrievalTab() {
  const { lastSavedRetrievalId } = useChatLifecycle();
  const { openRetrievalTab } = useContentTab();
  const handledRef = useRef<string | null>(null);

  useEffect(
    function openTabOnRetrievalSaved() {
      if (lastSavedRetrievalId && lastSavedRetrievalId !== handledRef.current) {
        handledRef.current = lastSavedRetrievalId;
        openRetrievalTab(lastSavedRetrievalId);
      }
    },
    [lastSavedRetrievalId, openRetrievalTab],
  );

  return null;
}

export function SessionPage() {
  return (
    <ContentTabProvider>
      <ChatLifecycleProvider>
        <AutoOpenRetrievalTab />
        <div className="flex flex-1 min-w-0">
          <ContentPanel />
          <ChatPanel />
        </div>
      </ChatLifecycleProvider>
    </ContentTabProvider>
  );
}

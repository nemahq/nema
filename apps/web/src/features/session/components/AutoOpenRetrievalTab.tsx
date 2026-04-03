import { useEffect, useRef } from "react";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useContentTab } from "@web/features/session/contexts/ContentTabContext";

export function AutoOpenRetrievalTab() {
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

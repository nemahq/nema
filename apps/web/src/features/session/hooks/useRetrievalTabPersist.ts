import { useCallback, useEffect, useState } from "react";

import { getRecordEntry, setRecordEntry } from "@web/utils/localStorage";

function loadRetrievalTabs(sessionId: string): Set<string> {
  const raw = getRecordEntry("openRetrievalTabs", sessionId);
  if (!raw) {
    return new Set();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return new Set(parsed as string[]);
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function persistRetrievalTabs(sessionId: string, tabs: Set<string>) {
  setRecordEntry("openRetrievalTabs", sessionId, JSON.stringify([...tabs]));
}

export function useRetrievalTabPersist(sessionId: string) {
  const [openRetrievalTabs, setOpenRetrievalTabs] = useState<Set<string>>(() =>
    loadRetrievalTabs(sessionId),
  );

  useEffect(
    function resetRetrievalTabsOnSessionChange() {
      setOpenRetrievalTabs(loadRetrievalTabs(sessionId));
    },
    [sessionId],
  );

  useEffect(
    function syncRetrievalTabsToStorage() {
      persistRetrievalTabs(sessionId, openRetrievalTabs);
    },
    [sessionId, openRetrievalTabs],
  );

  const openRetrievalTab = useCallback((retrievalId: string) => {
    setOpenRetrievalTabs((prev) => new Set(prev).add(retrievalId));
  }, []);

  const closeRetrievalTab = useCallback((retrievalId: string) => {
    setOpenRetrievalTabs((prev) => {
      const next = new Set(prev);
      next.delete(retrievalId);
      return next;
    });
  }, []);

  return { openRetrievalTabs, openRetrievalTab, closeRetrievalTab };
}

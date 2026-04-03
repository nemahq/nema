import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { getRecordEntry, setRecordEntry } from "@web/utils/localStorage";

type ContentTabName = "help";

interface ContentTabContextValue {
  openTabs: Set<ContentTabName>;
  openTab: (name: ContentTabName) => void;
  closeTab: (name: ContentTabName) => void;
  openRetrievalTabs: Set<string>;
  openRetrievalTab: (retrievalId: string) => void;
  closeRetrievalTab: (retrievalId: string) => void;
  tabOrder: string[];
  setTabOrder: (order: string[]) => void;
}

const ContentTabContext = createContext<ContentTabContextValue | null>(null);

interface ContentTabProviderProps {
  children: ReactNode;
}

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

export function ContentTabProvider({ children }: ContentTabProviderProps) {
  const sessionId = useSessionId();

  const [openTabs, setOpenTabs] = useState<Set<ContentTabName>>(
    () => new Set(),
  );
  const [openRetrievalTabs, setOpenRetrievalTabs] = useState<Set<string>>(() =>
    loadRetrievalTabs(sessionId),
  );
  const [tabOrder, setTabOrderState] = useState<string[]>([]);

  const setTabOrder = useCallback((order: string[]) => {
    setTabOrderState(order);
  }, []);

  useEffect(
    function syncRetrievalTabsToStorage() {
      persistRetrievalTabs(sessionId, openRetrievalTabs);
    },
    [sessionId, openRetrievalTabs],
  );

  function openTab(name: ContentTabName) {
    setOpenTabs((prev) => new Set(prev).add(name));
  }

  function closeTab(name: ContentTabName) {
    setOpenTabs((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }

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

  return (
    <ContentTabContext
      value={{
        openTabs,
        openTab,
        closeTab,
        openRetrievalTabs,
        openRetrievalTab,
        closeRetrievalTab,
        tabOrder,
        setTabOrder,
      }}
    >
      {children}
    </ContentTabContext>
  );
}

export function useContentTab() {
  const ctx = useContext(ContentTabContext);
  if (!ctx) {
    throw new Error("useContentTab must be used within ContentTabProvider.");
  }
  return ctx;
}

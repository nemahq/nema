import { createContext, type ReactNode, useContext, useState } from "react";

import { useRetrievalTabPersist } from "@web/features/session/hooks/useRetrievalTabPersist";
import { useSessionId } from "@web/features/session/hooks/useSessionId";

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

export function ContentTabProvider({ children }: ContentTabProviderProps) {
  const sessionId = useSessionId();
  const { openRetrievalTabs, openRetrievalTab, closeRetrievalTab } =
    useRetrievalTabPersist(sessionId);

  const [openTabs, setOpenTabs] = useState<Set<ContentTabName>>(
    () => new Set(),
  );
  const [tabOrder, setTabOrder] = useState<string[]>([]);

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

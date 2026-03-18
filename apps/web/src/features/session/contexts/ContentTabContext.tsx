import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

type ContentTabName = "help";

interface ContentTabContextValue {
  openTabs: Set<ContentTabName>;
  openTab: (name: ContentTabName) => void;
  closeTab: (name: ContentTabName) => void;
}

const ContentTabContext = createContext<ContentTabContextValue | null>(null);

interface ContentTabProviderProps {
  children: ReactNode;
}

export function ContentTabProvider({ children }: ContentTabProviderProps) {
  const [openTabs, setOpenTabs] = useState<Set<ContentTabName>>(
    () => new Set(),
  );

  const openTab = useCallback(
    (name: ContentTabName) => setOpenTabs((prev) => new Set(prev).add(name)),
    [],
  );

  const closeTab = useCallback(
    (name: ContentTabName) =>
      setOpenTabs((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      }),
    [],
  );

  return (
    <ContentTabContext value={{ openTabs, openTab, closeTab }}>
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

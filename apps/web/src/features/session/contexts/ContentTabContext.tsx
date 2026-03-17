import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

interface ContentTabContextValue {
  helpTabOpen: boolean;
  openHelpTab: () => void;
  closeHelpTab: () => void;
}

const ContentTabContext = createContext<ContentTabContextValue | null>(null);

export function ContentTabProvider({ children }: { children: ReactNode }) {
  const [helpTabOpen, setHelpTabOpen] = useState(false);
  const openHelpTab = useCallback(() => setHelpTabOpen(true), []);
  const closeHelpTab = useCallback(() => setHelpTabOpen(false), []);

  return (
    <ContentTabContext value={{ helpTabOpen, openHelpTab, closeHelpTab }}>
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

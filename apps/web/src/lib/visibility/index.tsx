import { createContext, type ReactNode, useContext } from "react";

const VisibilityContext = createContext(true);

interface VisibilityProviderProps {
  visible: boolean;
  children: ReactNode;
}

export function VisibilityProvider({
  visible,
  children,
}: VisibilityProviderProps) {
  return <VisibilityContext value={visible}>{children}</VisibilityContext>;
}

export function useVisible(): boolean {
  return useContext(VisibilityContext);
}

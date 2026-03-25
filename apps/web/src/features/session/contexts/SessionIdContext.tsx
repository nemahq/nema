import { createContext, type ReactNode, useContext } from "react";

const SessionIdContext = createContext<string | null>(null);

interface SessionIdProviderProps {
  sessionId: string;
  children: ReactNode;
}

export function SessionIdProvider({
  sessionId,
  children,
}: SessionIdProviderProps) {
  return <SessionIdContext value={sessionId}>{children}</SessionIdContext>;
}

export function useSessionId(): string {
  const sessionId = useContext(SessionIdContext);
  if (!sessionId) {
    throw new Error("useSessionId must be used within SessionIdProvider.");
  }
  return sessionId;
}

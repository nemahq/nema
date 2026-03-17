import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react";

import type { RegisteredAction } from "./types";

interface ActionRegistryContextValue {
  register: (action: RegisteredAction) => void;
  unregister: (id: string) => void;
  getAll: () => RegisteredAction[];
}

const ActionRegistryContext = createContext<ActionRegistryContextValue | null>(
  null,
);

export function ActionRegistryProvider({ children }: { children: ReactNode }) {
  const actionsRef = useRef(new Map<string, RegisteredAction>());

  const register = useCallback((action: RegisteredAction) => {
    actionsRef.current.set(action.id, action);
  }, []);

  const unregister = useCallback((id: string) => {
    actionsRef.current.delete(id);
  }, []);

  const getAll = useCallback(() => Array.from(actionsRef.current.values()), []);

  return (
    <ActionRegistryContext value={{ register, unregister, getAll }}>
      {children}
    </ActionRegistryContext>
  );
}

export function useActionRegistry() {
  const ctx = useContext(ActionRegistryContext);
  if (!ctx) {
    throw new Error(
      "useActionRegistry must be used within ActionRegistryProvider.",
    );
  }
  return ctx;
}

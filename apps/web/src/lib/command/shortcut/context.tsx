import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react";

import type { TranslationKey } from "@web/lib/tolgee";

import type { ActionId } from "./actionMap";
import type { ActionScope } from "./types";

interface RegisteredAction {
  id: ActionId;
  category: string;
  labelKey: TranslationKey;
  shortcut: string;
  scope: ActionScope;
  execute: () => void;
}

interface ActionRegistryContextValue {
  register: (action: RegisteredAction) => void;
  unregister: (id: ActionId) => void;
  getAll: () => RegisteredAction[];
}

const ActionRegistryContext = createContext<ActionRegistryContextValue | null>(
  null,
);

export function ActionRegistryProvider({ children }: { children: ReactNode }) {
  const actionsRef = useRef(new Map<ActionId, RegisteredAction>());

  const register = useCallback((action: RegisteredAction) => {
    actionsRef.current.set(action.id, action);
  }, []);

  const unregister = useCallback((id: ActionId) => {
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

import { createContext, type ReactNode, useContext, useRef } from "react";

import type { TranslationKey } from "@web/lib/tolgee";

import type { ActionId } from "./actionMap";
import type { ActionScope } from "./types";

interface RegisteredAction {
  id: ActionId;
  category: string;
  labelKey: TranslationKey;
  shortcut: string;
  scope: ActionScope;
  priority: number;
  execute: () => void;
}

interface ActionRegistryContextValue {
  register: (action: RegisteredAction) => void;
  unregister: (id: ActionId) => void;
  getAll: () => RegisteredAction[];
  isShortcutSuppressed: (id: ActionId) => boolean;
}

const ActionRegistryContext = createContext<ActionRegistryContextValue | null>(
  null,
);

interface ActionRegistryProviderProps {
  children: ReactNode;
}

export function ActionRegistryProvider({
  children,
}: ActionRegistryProviderProps) {
  const actionsRef = useRef(new Map<ActionId, RegisteredAction>());

  function register(action: RegisteredAction) {
    actionsRef.current.set(action.id, action);
  }

  function unregister(id: ActionId) {
    actionsRef.current.delete(id);
  }

  function getAll() {
    return Array.from(actionsRef.current.values());
  }

  function isShortcutSuppressed(id: ActionId): boolean {
    const action = actionsRef.current.get(id);
    if (!action) {
      return false;
    }
    for (const other of actionsRef.current.values()) {
      if (
        other.id !== id &&
        other.shortcut === action.shortcut &&
        other.priority > action.priority
      ) {
        return true;
      }
    }
    return false;
  }

  return (
    <ActionRegistryContext
      value={{ register, unregister, getAll, isShortcutSuppressed }}
    >
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

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
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
  priority: number;
  execute: () => void;
}

interface ActionRegistryContextValue {
  register: (action: RegisteredAction) => void;
  unregister: (id: ActionId) => void;
  getAll: () => RegisteredAction[];
  isShortcutSuppressed: (id: ActionId) => boolean;
  registryVersion: number;
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
  const [registryVersion, setRegistryVersion] = useState(0);

  const register = useCallback(function register(action: RegisteredAction) {
    const isNew = !actionsRef.current.has(action.id);
    actionsRef.current.set(action.id, action);
    if (isNew) {
      setRegistryVersion((v) => v + 1);
    }
  }, []);

  const unregister = useCallback(function unregister(id: ActionId) {
    if (actionsRef.current.has(id)) {
      actionsRef.current.delete(id);
      setRegistryVersion((v) => v + 1);
    }
  }, []);

  const getAll = useCallback(function getAll() {
    return Array.from(actionsRef.current.values());
  }, []);

  const isShortcutSuppressed = useCallback(function isShortcutSuppressed(
    id: ActionId,
  ): boolean {
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
  }, []);

  const contextValue = useMemo(
    () => ({
      register,
      unregister,
      getAll,
      isShortcutSuppressed,
      registryVersion,
    }),
    [register, unregister, getAll, isShortcutSuppressed, registryVersion],
  );

  return (
    <ActionRegistryContext value={contextValue}>
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

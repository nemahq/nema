import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { type ActionId, getActionDef } from "./actionMap";
import { useActionRegistry } from "./context";

interface UseRegisterActionOptions {
  execute: () => void;
  enabled?: boolean;
}

function resolveShortcut(shortcut: string): string {
  if (!shortcut.includes("mod")) {
    return shortcut;
  }
  const withMeta = shortcut.replace(/\bmod\b/g, "meta");
  const withCtrl = shortcut.replace(/\bmod\b/g, "ctrl");
  return `${withMeta}, ${withCtrl}`;
}

export function useRegisterAction(
  id: ActionId,
  { execute, enabled = true }: UseRegisterActionOptions,
) {
  const { register, unregister } = useActionRegistry();
  const def = getActionDef(id);

  const executeRef = useRef(execute);
  useEffect(function syncExecuteRef() {
    executeRef.current = execute;
  });

  useEffect(
    function syncRegistry() {
      if (!enabled) {
        unregister(id);
        return;
      }

      register({
        id,
        category: def.category,
        labelKey: def.labelKey,
        shortcut: def.shortcut,
        scope: def.scope,
        execute: () => executeRef.current(),
      });

      return () => unregister(id);
    },
    [
      id,
      enabled,
      def.category,
      def.labelKey,
      def.shortcut,
      def.scope,
      register,
      unregister,
    ],
  );

  const hasModifier =
    def.shortcut.includes("mod") ||
    def.shortcut.includes("ctrl") ||
    def.shortcut.includes("meta") ||
    def.shortcut.includes("shift") ||
    def.shortcut.includes("alt");

  useHotkeys(
    resolveShortcut(def.shortcut),
    (e) => {
      e.preventDefault();
      executeRef.current();
    },
    {
      enabled,
      enableOnFormTags:
        hasModifier || def.shortcut === "escape"
          ? ["INPUT", "TEXTAREA", "SELECT"]
          : false,
    },
  );
}

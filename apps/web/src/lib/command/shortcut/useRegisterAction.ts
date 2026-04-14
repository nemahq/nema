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

const MODIFIER_KEYS = ["mod", "ctrl", "meta", "shift", "alt"];

interface UseRegisterActionResult {
  isShortcutSuppressed: boolean;
}

export function useRegisterAction(
  id: ActionId,
  { execute, enabled = true }: UseRegisterActionOptions,
): UseRegisterActionResult {
  const registry = useActionRegistry();
  const { register, unregister, isShortcutSuppressed } = registry;
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
        priority: def.priority,
        execute: () => executeRef.current(),
      });

      return () => unregister(id);
    },
    [id, enabled, register, unregister, def],
  );

  const hasModifier = MODIFIER_KEYS.some((key) => def.shortcut.includes(key));
  const suppressed = enabled && isShortcutSuppressed(id);

  useHotkeys(
    resolveShortcut(def.shortcut),
    (e) => {
      if (isShortcutSuppressed(id)) {
        return;
      }
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

  return { isShortcutSuppressed: suppressed };
}

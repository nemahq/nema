import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useVisible } from "@web/lib/visibility";

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

export function useRegisterAction(
  id: ActionId,
  { execute, enabled = true }: UseRegisterActionOptions,
) {
  const { register, unregister } = useActionRegistry();
  const def = getActionDef(id);
  const visible = useVisible();
  const effectiveEnabled = visible && enabled;

  const executeRef = useRef(execute);
  useEffect(function syncExecuteRef() {
    executeRef.current = execute;
  });

  useEffect(
    function syncRegistry() {
      if (!effectiveEnabled) {
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
    [id, effectiveEnabled, register, unregister, def],
  );

  const hasModifier = MODIFIER_KEYS.some((key) => def.shortcut.includes(key));

  useHotkeys(
    resolveShortcut(def.shortcut),
    (e) => {
      e.preventDefault();
      executeRef.current();
    },
    {
      enabled: effectiveEnabled,
      enableOnFormTags:
        hasModifier || def.shortcut === "escape"
          ? ["INPUT", "TEXTAREA", "SELECT"]
          : false,
    },
  );
}

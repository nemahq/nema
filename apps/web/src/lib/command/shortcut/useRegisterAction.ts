import { useEffect, useMemo, useRef } from "react";
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
  isShortcutOverridden: boolean;
}

export function useRegisterAction(
  id: ActionId,
  { execute, enabled = true }: UseRegisterActionOptions,
): UseRegisterActionResult {
  const { register, unregister, isShortcutOverridden, isModalOpen } =
    useActionRegistry();
  const def = useMemo(() => getActionDef(id), [id]);

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
  const overridden = enabled && isShortcutOverridden(id);

  useHotkeys(
    resolveShortcut(def.shortcut),
    (e) => {
      if (isShortcutOverridden(id)) {
        return;
      }
      if (def.scope === "global" && isModalOpen()) {
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
      // Radix Dialog가 Esc를 캡처 단계에서 처리해 자기 자신을 닫는데, 우리
      // 쪽이 버블 단계면 그 처리(→ onOpenChange → 이펙트 클린업 → popModal)가
      // 이미 끝난 뒤에야 실행돼 isModalOpen()이 이 이벤트 도중에 벌써 false가
      // 되는 문제가 있었다(지연 트릭으로도 못 고침 — dispatchEvent는 리스너
      // 하나 끝날 때마다 마이크로태스크 체크포인트를 도는 스펙이라, 마이크로/
      // 매크로 지연 둘 다 그 사이에 먹힌다). 우리도 캡처 단계로 붙이면 같은
      // document·같은 단계에서는 등록 순서대로 실행되므로(SidePanel이 먼저
      // 열려 먼저 등록됨) 순서가 타이밍이 아니라 등록 시점으로 결정된다.
      eventListenerOptions: { capture: true },
    },
  );

  return { isShortcutOverridden: overridden };
}

import type { TranslationKey } from "@web/lib/tolgee";

import type { ActionDef, ActionScope } from "./types";

function def(
  labelKey: TranslationKey,
  shortcut: string,
  scope: ActionScope,
  priority = 0,
): ActionDef {
  return { labelKey, shortcut, scope, priority };
}

// priority: 같은 단축키에 여러 액션이 등록되면 높은 값이 우선 실행된다 (z-index 방식).
// 기본값 0 = 최저 우선순위. 새 액션은 별도 지정 없이 양보한다.
const actionMap = {
  draft: {
    regenerate: def("intake.remember", "mod+enter", "global"),
  },
  sidePanel: {
    close: def("common.close", "escape", "global"),
  },
  sidebar: {
    toggle: def("layout.toggle_sidebar", "mod+b", "global"),
  },
} satisfies Record<string, Record<string, ActionDef>>;

export type ActionId = {
  [C in keyof typeof actionMap]: `${C & string}.${keyof (typeof actionMap)[C] & string}`;
}[keyof typeof actionMap];

export function getActionDef(id: ActionId): ActionDef & { category: string } {
  const dotIndex = id.indexOf(".");
  const category = id.slice(0, dotIndex);
  const name = id.slice(dotIndex + 1);
  const categoryActions = actionMap[category as keyof typeof actionMap];
  const action = (categoryActions as Record<string, ActionDef>)[name];
  if (!action) {
    throw new Error(`Unknown action: ${id}`);
  }
  return { ...action, category };
}

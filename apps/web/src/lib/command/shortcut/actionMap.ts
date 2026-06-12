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
    cancel: def("common.cancel", "escape", "global"),
  },
  stream: {
    stop: def("session.stream_stop", "escape", "global", 1),
  },
  navigation: {
    focusComposer: def("session.focus_composer", "mod+l", "global"),
    newContext: def("session.new_context", "mod+shift+o", "global"),
    prevSession: def("session.prev_session", "mod+shift+up", "global"),
    nextSession: def("session.next_session", "mod+shift+down", "global"),
  },
  sidebar: {
    toggle: def("layout.toggle_sidebar", "mod+b", "global"),
  },
  split: {
    right: def("session.split_right", "mod+Backslash", "global"),
    down: def("session.split_down", "mod+shift+Backslash", "global"),
    focusNextPane: def(
      "session.focus_next_pane",
      "alt+right, alt+down",
      "global",
    ),
    focusPrevPane: def("session.focus_prev_pane", "alt+left, alt+up", "global"),
  },
  tab: {
    close: def("session.tab_close", "alt+w", "global"),
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

export function getAllActionDefs() {
  return Object.entries(actionMap).flatMap(([category, actions]) =>
    Object.entries(actions).map(([name, action]) => ({
      ...action,
      id: `${category}.${name}` as ActionId,
      category,
    })),
  );
}

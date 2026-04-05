import type { TranslationKey } from "@web/lib/tolgee";

import type { ActionDef, ActionScope } from "./types";

function def(
  labelKey: TranslationKey,
  shortcut: string,
  scope: ActionScope,
): ActionDef {
  return { labelKey, shortcut, scope };
}

const actionMap = {
  draft: {
    save: def("session.draft_save", "mod+s", "global"),
    cancel: def("common.cancel", "escape", "global"),
  },
  stream: {
    stop: def("session.stream_stop", "escape", "global"),
  },
  navigation: {
    focusComposer: def("session.focus_composer", "mod+l", "global"),
    newContext: def("session.new_context", "mod+shift+o", "global"),
    prevSession: def("session.prev_session", "alt+up", "global"),
    nextSession: def("session.next_session", "alt+down", "global"),
  },
  sidebar: {
    toggle: def("layout.toggle_sidebar", "mod+b", "global"),
  },
  split: {
    right: def("session.split_right", "mod+\\", "global"),
    down: def("session.split_down", "mod+shift+\\", "global"),
    focusNextPane: def("session.focus_next_pane", "mod+]", "global"),
    focusPrevPane: def("session.focus_prev_pane", "mod+[", "global"),
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

import type { ActionDef, ActionScope } from "./types";

function def(
  labelKey: string,
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
    newContext: def("session.new_context", "mod+shift+o", "global"),
  },
  sidebar: {
    toggle: def("layout.toggle_sidebar", "mod+b", "global"),
  },
  // TODO: 드래프트 탭 닫기 UX 구현 완료 후 활성화
  // tab: {
  //   close: def("session.tab_close", "mod+shift+w", "global"),
  // },
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

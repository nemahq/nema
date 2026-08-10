import type { TranslationKey } from "@web/lib/tolgee";

import type { ActionDef, ActionScope } from "./types";

function def(
  labelKey: TranslationKey,
  shortcut: string,
  scope: ActionScope,
  priority = 0,
  enableOnFormTags = true,
): ActionDef {
  return { labelKey, shortcut, scope, priority, enableOnFormTags };
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
  review: {
    // mod+z/mod+shift+z는 텍스트 필드 안에서는 브라우저 네이티브 실행취소에 양보한다
    // (enableOnFormTags: false) — 제목·설명은 <textarea>라 그 안에서 오타를 지우려는
    // 시도가 초안 전체 롤백으로 가로채이면 안 된다.
    undo: def("review.undo_action", "mod+z", "global", 0, false),
    redo: def("review.redo_action", "mod+shift+z", "global", 0, false),
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

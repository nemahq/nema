import type { TranslationKey } from "@web/lib/tolgee";

// global: 모달이 하나라도 열려있으면 자동으로 양보(useRegisterAction 참고).
// modal: 이 양보 규칙에서 제외 — 모달 자신의 단축키가 스스로를 막으면 안 된다.
export type ActionScope = "global" | "modal";

export interface ActionDef {
  labelKey: TranslationKey;
  shortcut: string;
  scope: ActionScope;
  priority: number;
}

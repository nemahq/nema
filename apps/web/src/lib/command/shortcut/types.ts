import type { TranslationKey } from "@web/lib/tolgee";

export type ActionScope = "global";

export interface ActionDef {
  labelKey: TranslationKey;
  shortcut: string;
  scope: ActionScope;
  priority: number;
}

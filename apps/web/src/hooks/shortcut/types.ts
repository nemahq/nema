export type ActionScope = "global" | "chat";

export interface ActionDef {
  labelKey: string;
  shortcut: string;
  scope: ActionScope;
}

export interface RegisteredAction {
  id: string;
  category: string;
  labelKey: string;
  shortcut: string;
  scope: ActionScope;
  execute: () => void;
}

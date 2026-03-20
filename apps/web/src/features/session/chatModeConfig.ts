import { CHAT_MODES, type ChatMode } from "@nema-io/shared";
import { ArrowUp, Search } from "@nema-io/weave/icons";

export const MODE_CONFIG: Record<
  ChatMode,
  {
    icon: typeof ArrowUp;
    placeholderKey:
      | "session.input_placeholder"
      | "session.input_placeholder_ask";
    labelKey: "session.mode_remember" | "session.mode_ask";
    color: string;
  }
> = {
  remember: {
    icon: ArrowUp,
    placeholderKey: "session.input_placeholder",
    labelKey: "session.mode_remember",
    color: "text-mode-remember",
  },
  ask: {
    icon: Search,
    placeholderKey: "session.input_placeholder_ask",
    labelKey: "session.mode_ask",
    color: "text-mode-ask",
  },
};

export function nextMode(current: ChatMode): ChatMode {
  const idx = CHAT_MODES.indexOf(current);
  return CHAT_MODES[(idx + 1) % CHAT_MODES.length];
}

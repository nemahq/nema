import { useState } from "react";

import type { ChatMode } from "@nema-io/shared";

import { nextMode } from "@web/features/session/chatModeConfig";
import { getStorage, setStorage } from "@web/utils/localStorage";

export function useChatMode() {
  const [mode, setMode] = useState<ChatMode>(
    () => getStorage("chatMode") ?? "remember",
  );

  function toggleMode() {
    setMode((prev) => {
      const next = nextMode(prev);
      setStorage("chatMode", next);
      return next;
    });
  }

  return { mode, toggleMode } as const;
}

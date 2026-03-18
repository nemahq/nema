import { useState } from "react";

import { getStorage, setStorage } from "@web/utils/localStorage";

function readDrafts(): Record<string, string> {
  const raw = getStorage("chatDrafts");
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as Record<string, string>;
}

function writeDrafts(drafts: Record<string, string>): void {
  setStorage("chatDrafts", JSON.stringify(drafts));
}

export function useChatDraft(sessionId: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => readDrafts()[sessionId] ?? "");

  function setDraft(next: string) {
    setValue(next);
    const drafts = readDrafts();
    if (next) {
      drafts[sessionId] = next;
    } else {
      const rest = Object.fromEntries(
        Object.entries(drafts).filter(([key]) => key !== sessionId),
      );
      writeDrafts(rest);
      return;
    }
    writeDrafts(drafts);
  }

  return [value, setDraft];
}

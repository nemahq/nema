import { useState } from "react";

import { getRecordStorage, setRecordStorage } from "@web/utils/localStorage";

export function useChatDraft(sessionId: string): [string, (v: string) => void] {
  const [draft, setDraftState] = useState(
    () => getRecordStorage("chatDrafts")[sessionId] ?? "",
  );

  function setDraft(next: string) {
    setDraftState(next);
    const drafts = getRecordStorage("chatDrafts");
    if (next) {
      drafts[sessionId] = next;
    } else {
      const rest = Object.fromEntries(
        Object.entries(drafts).filter(([key]) => key !== sessionId),
      );
      setRecordStorage("chatDrafts", rest);
      return;
    }
    setRecordStorage("chatDrafts", drafts);
  }

  return [draft, setDraft];
}

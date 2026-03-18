import { useState } from "react";

import {
  deleteRecordEntry,
  getRecordEntry,
  setRecordEntry,
} from "@web/utils/localStorage";

export function useChatDraft(sessionId: string): [string, (v: string) => void] {
  const [draft, setDraftState] = useState(
    () => getRecordEntry("chatDrafts", sessionId) ?? "",
  );

  function setDraft(next: string) {
    setDraftState(next);
    if (next) {
      setRecordEntry("chatDrafts", sessionId, next);
    } else {
      deleteRecordEntry("chatDrafts", sessionId);
    }
  }

  return [draft, setDraft];
}

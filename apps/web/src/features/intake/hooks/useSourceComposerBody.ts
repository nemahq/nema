import { useState } from "react";

import {
  deleteRecordEntry,
  getRecordEntry,
  setRecordEntry,
} from "@web/utils/localStorage";

export function useSourceComposerBody(
  spaceId: string | undefined,
): [string, (v: string) => void] {
  const [body, setBodyState] = useState(() =>
    spaceId ? (getRecordEntry("sourceComposerBody", spaceId) ?? "") : "",
  );

  function setBody(next: string) {
    setBodyState(next);
    if (!spaceId) {
      return;
    }
    if (next !== "") {
      setRecordEntry("sourceComposerBody", spaceId, next);
    } else {
      deleteRecordEntry("sourceComposerBody", spaceId);
    }
  }

  return [body, setBody];
}

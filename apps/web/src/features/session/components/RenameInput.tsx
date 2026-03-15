import { useRef, useState } from "react";

import { SESSION_TITLE_MAX_LENGTH } from "@nema-io/shared";

import { useUpdateSession } from "@web/features/session/hooks/useUpdateSession";

interface RenameInputProps {
  sessionId: string;
  currentTitle: string | null;
  onEditEnd: () => void;
}

export function RenameInput({
  sessionId,
  currentTitle,
  onEditEnd,
}: RenameInputProps) {
  const [editValue, setEditValue] = useState(currentTitle ?? "");
  const updateMutation = useUpdateSession();
  const doneRef = useRef(false);

  function commitEdit() {
    if (doneRef.current) {
      return;
    }
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === currentTitle) {
      doneRef.current = true;
      onEditEnd();
      return;
    }
    doneRef.current = true;
    updateMutation.mutate({ sessionId, title: trimmed });
    onEditEnd();
  }

  return (
    <input
      autoFocus
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commitEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          doneRef.current = true;
          onEditEnd();
        }
      }}
      maxLength={SESSION_TITLE_MAX_LENGTH}
      className="w-full rounded-md bg-surface-raised px-2 py-1.5 text-sm text-fg-primary outline-none ring-1 ring-brand"
    />
  );
}

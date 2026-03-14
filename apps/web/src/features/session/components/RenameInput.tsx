import { useState } from "react";

import { SESSION_TITLE_MAX_LENGTH } from "@nema-io/shared";

import { useUpdateSession } from "@web/features/session/hooks/useUpdateSession";

interface RenameInputProps {
  sessionId: string;
  currentTitle: string | null;
  onDone: () => void;
}

export function RenameInput({
  sessionId,
  currentTitle,
  onDone,
}: RenameInputProps) {
  const [editValue, setEditValue] = useState(currentTitle ?? "");
  const updateMutation = useUpdateSession();

  function commitEdit() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === currentTitle) {
      onDone();
      return;
    }
    updateMutation.mutate({ sessionId, title: trimmed }, { onSettled: onDone });
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
          onDone();
        }
      }}
      maxLength={SESSION_TITLE_MAX_LENGTH}
      className="w-full rounded-md bg-surface-raised px-2 py-1.5 text-sm text-fg-primary outline-none ring-1 ring-brand"
    />
  );
}

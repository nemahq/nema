import { type KeyboardEvent, type ReactNode } from "react";

interface DraftCardShellProps {
  onSelect: () => void;
  children: ReactNode;
}

export function DraftCardShell({ onSelect, children }: DraftCardShellProps) {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex cursor-pointer flex-col gap-2 rounded-lg px-4 py-3 transition-colors duration-fast hover:bg-surface-raised-hover/40"
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

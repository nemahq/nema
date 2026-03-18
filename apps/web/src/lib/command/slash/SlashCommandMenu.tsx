import { cn } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

import type { SlashCommand } from "./types";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
}

export function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelect,
}: SlashCommandMenuProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-full left-0 mb-1 w-full rounded-md border border-border bg-surface-card p-1 shadow-md">
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
            i === selectedIndex
              ? "bg-surface-raised-hover"
              : "hover:bg-surface-raised-hover",
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd);
          }}
        >
          <span className="font-medium text-fg-primary">/{cmd.name}</span>
          <span className="text-fg-tertiary">{t(cmd.descriptionKey)}</span>
        </button>
      ))}
    </div>
  );
}

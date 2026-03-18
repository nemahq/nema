import { useState } from "react";

import type { SlashCommand } from "./types";

interface UseSlashCommandMenuResult {
  showMenu: boolean;
  filteredCommands: SlashCommand[];
  selectedIndex: number;
  selectCommand: (command: SlashCommand) => void;
  handleMenuKeyDown: (key: string, isComposing: boolean) => boolean;
  handleValueChange: () => void;
}

export function useSlashCommandMenu(
  commands: SlashCommand[],
  value: string,
  onClearValue: () => void,
): UseSlashCommandMenuResult {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  const slashQuery = value.startsWith("/")
    ? value.slice(1).toLowerCase()
    : null;
  const filteredCommands =
    slashQuery !== null && !menuDismissed
      ? commands.filter((cmd) => cmd.name.startsWith(slashQuery))
      : [];
  const showMenu = filteredCommands.length > 0;

  function selectCommand(command: SlashCommand) {
    command.execute();
    onClearValue();
  }

  const keyHandlers: Record<string, () => void> = {
    ArrowUp: () =>
      setSelectedIndex((prev) =>
        prev <= 0 ? filteredCommands.length - 1 : prev - 1,
      ),
    ArrowDown: () =>
      setSelectedIndex((prev) =>
        prev >= filteredCommands.length - 1 ? 0 : prev + 1,
      ),
    Enter: () => {
      const command = filteredCommands[selectedIndex];
      if (command) {
        selectCommand(command);
      }
    },
    Escape: () => setMenuDismissed(true),
  };

  function handleMenuKeyDown(key: string, isComposing: boolean): boolean {
    if (!showMenu) {
      return false;
    }
    if (key === "Enter" && isComposing) {
      return false;
    }
    const handler = keyHandlers[key];
    if (!handler) {
      return false;
    }
    handler();
    return true;
  }

  function handleValueChange() {
    setSelectedIndex(0);
    setMenuDismissed(false);
  }

  return {
    showMenu,
    filteredCommands,
    selectedIndex,
    selectCommand,
    handleMenuKeyDown,
    handleValueChange,
  };
}

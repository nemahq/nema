import { type KeyboardEvent, useRef, useState } from "react";

import { Button, cn } from "@nema-io/weave";
import { ArrowUp, Square } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

import { SlashCommandMenu } from "./SlashCommandMenu";

const MAX_TEXTAREA_HEIGHT_PX = 200;

const ACTION_BUTTON_BASE =
  "self-end rounded-full transition-all duration-normal";

export interface SlashCommand {
  name: string;
  descriptionKey: string;
  execute: () => void;
}

interface ChatInputProps {
  onSubmit: (content: string) => void;
  onStop?: () => void;
  placeholder?: string;
  submitDisabled?: boolean;
  autoFocus?: boolean;
  slashCommands?: SlashCommand[];
}

export function ChatInput({
  onSubmit,
  onStop,
  placeholder,
  submitDisabled,
  autoFocus,
  slashCommands,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function adjustHeight() {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }

  const isStreaming = !!onStop;
  const hasContent = !!value.trim();

  const [menuDismissed, setMenuDismissed] = useState(false);
  const slashQuery = value.startsWith("/")
    ? value.slice(1).toLowerCase()
    : null;
  const filteredCommands =
    slashQuery !== null && slashCommands && !menuDismissed
      ? slashCommands.filter((cmd) => cmd.name.startsWith(slashQuery))
      : [];
  const showMenu = filteredCommands.length > 0;

  function clearInput() {
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function selectCommand(command: SlashCommand) {
    command.execute();
    clearInput();
  }

  function handleSubmit() {
    if (!hasContent || submitDisabled || isStreaming) {
      return;
    }
    onSubmit(value.trim());
    clearInput();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showMenu) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? filteredCommands.length - 1 : prev - 1,
        );
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev >= filteredCommands.length - 1 ? 0 : prev + 1,
        );
        return;
      }
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const command = filteredCommands[selectedIndex];
        if (command) {
          selectCommand(command);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenuDismissed(true);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleChange(newValue: string) {
    setValue(newValue);
    setSelectedIndex(0);
    setMenuDismissed(false);
    adjustHeight();
  }

  return (
    <div className="relative flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface-raised p-3 shadow-sm transition-shadow duration-normal focus-within:border-border-strong focus-within:shadow-md dark:bg-surface-raised-hover">
      {showMenu && (
        <SlashCommandMenu
          commands={filteredCommands}
          selectedIndex={selectedIndex}
          onSelect={selectCommand}
        />
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        className="w-full resize-none bg-transparent px-2 py-1 text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
      />
      {isStreaming ? (
        <Button
          variant="neutral"
          size="icon-sm"
          onClick={onStop}
          aria-label={t("common.stop")}
          className={cn(
            ACTION_BUTTON_BASE,
            "bg-fg-secondary text-surface-card border-transparent hover:opacity-80",
            "dark:bg-fg-primary dark:text-surface-base",
          )}
        >
          <Square className="size-3 fill-current" />
        </Button>
      ) : (
        <Button
          variant="neutral"
          size="icon-sm"
          disabled={submitDisabled || !hasContent}
          onClick={handleSubmit}
          aria-label={t("common.send")}
          className={cn(
            ACTION_BUTTON_BASE,
            "disabled:scale-90 disabled:bg-surface-raised-hover disabled:text-fg-tertiary disabled:border-transparent disabled:opacity-100",
            "dark:disabled:bg-fg-tertiary/20 dark:disabled:text-fg-tertiary",
            "enabled:bg-fg-secondary enabled:text-surface-card enabled:border-transparent enabled:hover:opacity-80",
            "dark:enabled:bg-fg-primary dark:enabled:text-surface-base",
            hasContent ? "opacity-100 scale-100" : "opacity-0 scale-90",
          )}
        >
          <ArrowUp className="size-4" />
        </Button>
      )}
    </div>
  );
}

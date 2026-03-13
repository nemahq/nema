import { type KeyboardEvent, useRef, useState } from "react";

import { Button } from "@nema-io/weave";
import { ArrowUp } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

export function ChatInput({
  onSubmit,
  placeholder,
  disabled,
}: {
  onSubmit: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function adjustHeight() {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSubmit(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3 focus-within:border-border-strong dark:bg-surface-raised-hover">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          adjustHeight();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none bg-transparent px-2 py-1 text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
      />
      <Button
        variant="neutral"
        size="icon-sm"
        disabled={disabled || !value.trim()}
        onClick={handleSubmit}
        aria-label={t("common.send")}
        className="self-end rounded-full transition-all duration-normal disabled:scale-90 disabled:bg-surface-raised-hover disabled:text-fg-tertiary disabled:border-transparent disabled:opacity-100 dark:disabled:bg-fg-tertiary/20 dark:disabled:text-fg-tertiary enabled:bg-fg-secondary enabled:text-surface-card enabled:border-transparent enabled:hover:opacity-80 dark:enabled:bg-fg-primary dark:enabled:text-surface-base"
      >
        <ArrowUp className="size-4" />
      </Button>
    </div>
  );
}

import { type KeyboardEvent, useRef, useState } from "react";

import { Button } from "@nema-io/weave";
import { ArrowUp } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

export function ChatInput({
  onSubmit,
  placeholder,
}: {
  onSubmit: (content: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function adjustHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
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
    <div className="flex w-full items-end gap-2 rounded-2xl border border-border bg-surface-raised p-3 dark:bg-surface-raised-hover">
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
        className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none"
      />
      <Button
        variant="neutral"
        size="icon-sm"
        disabled={!value.trim()}
        onClick={handleSubmit}
        aria-label={t("common.send")}
        className="rounded-full transition-all duration-normal disabled:scale-90 disabled:opacity-30 enabled:bg-fg-secondary enabled:text-surface-card enabled:border-transparent enabled:hover:opacity-80 dark:enabled:bg-white dark:enabled:text-surface-base"
      >
        <ArrowUp className="size-4" />
      </Button>
    </div>
  );
}

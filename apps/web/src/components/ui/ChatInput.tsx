import {
  type ComponentType,
  type KeyboardEvent,
  useEffect,
  useRef,
} from "react";

import { Button, cn } from "@nema-io/weave";
import { ArrowUp, Square } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

const MAX_TEXTAREA_HEIGHT_PX = 200;

const ACTION_BUTTON_BASE =
  "self-end rounded-full transition-all duration-normal";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (content: string) => void;
  onStop?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  submitDisabled?: boolean;
  autoFocus?: boolean;
  submitIcon?: ComponentType<{ className?: string }>;
  hint?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  onKeyDown,
  placeholder,
  submitDisabled,
  autoFocus,
  submitIcon: SubmitIcon = ArrowUp,
  hint,
}: ChatInputProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(
    function adjustHeight() {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
    },
    [value],
  );

  const isStreaming = !!onStop;
  const hasContent = !!value.trim();

  function handleSubmit() {
    if (!hasContent || submitDisabled || isStreaming) {
      return;
    }
    onSubmit(value.trim());
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface-raised p-3 shadow-sm transition-shadow duration-normal focus-within:border-border-strong focus-within:shadow-md dark:bg-surface-raised-hover">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
            <SubmitIcon className="size-4" />
          </Button>
        )}
      </div>
      {hint && (
        <div className="flex items-center gap-1.5 px-2 text-xs text-fg-tertiary">
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
}

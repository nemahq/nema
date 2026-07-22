import { type ComponentType, type KeyboardEvent, type ReactNode } from "react";

import { Button, cn, Textarea } from "@nema-io/weave";
import { ArrowUp, Square } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

// 이전 값 MAX_TEXTAREA_HEIGHT_PX(200px, 근거 기록 없음)를 대체 — text-sm
// (14px/leading-[1.5]=21px) 기준 21×10=210px로, 원래 값과 정확히 같지는
// 않지만 근접한 "10줄 상한"으로 근사했다.
const MAX_TEXTAREA_ROWS = 10;

const CHAT_COMPOSER_DATA_ATTR = "data-chat-composer";
export const CHAT_COMPOSER_SELECTOR = `[${CHAT_COMPOSER_DATA_ATTR}]`;

export const ACTION_BUTTON_BASE =
  "self-end rounded-full transition-all duration-normal";

interface SubmitButtonRenderProps {
  onClick: () => void;
  disabled: boolean;
  hasContent: boolean;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (content: string) => void;
  onStop?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  submitDisabled?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  submitIcon?: ComponentType<{ className?: string }>;
  // 제공되면 기본 아이콘 버튼 대신 이 결과를 그대로 렌더링한다(예: intake의 "기억하기"
  // 레이블 버튼 — icon-sm 원형 버튼엔 텍스트를 넣을 폭이 없어 완전히 다른 마크업이 필요).
  renderSubmitButton?: (props: SubmitButtonRenderProps) => ReactNode;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  onKeyDown,
  placeholder,
  submitDisabled,
  disabled,
  autoFocus,
  maxLength,
  submitIcon: SubmitIcon = ArrowUp,
  renderSubmitButton,
}: ChatInputProps) {
  const { t } = useTranslation();

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
    if (e.defaultPrevented || e.key !== "Enter" || e.nativeEvent.isComposing) {
      return;
    }

    // Cmd(Mac)/Ctrl(Win·Linux)+Enter로 제출, 그냥 Enter는 기본 동작인 개행 그대로 둔다.
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  let submitAction: ReactNode;
  if (isStreaming) {
    submitAction = (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onStop}
        aria-label={t("common.stop")}
        className={cn(
          ACTION_BUTTON_BASE,
          "bg-fg-secondary text-surface-card hover:bg-fg-secondary hover:opacity-80",
          "dark:bg-fg-primary dark:text-surface-base dark:hover:bg-fg-primary",
        )}
      >
        <Square className="size-3 fill-current" />
      </Button>
    );
  } else if (renderSubmitButton) {
    submitAction = renderSubmitButton({
      onClick: handleSubmit,
      disabled: submitDisabled || !hasContent,
      hasContent,
    });
  } else {
    submitAction = (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={submitDisabled || !hasContent}
        onClick={handleSubmit}
        aria-label={t("common.send")}
        className={cn(
          ACTION_BUTTON_BASE,
          "disabled:scale-90 disabled:bg-surface-raised-hover disabled:text-fg-quinary disabled:opacity-100",
          "dark:disabled:bg-fg-tertiary/20 dark:disabled:text-fg-quinary",
          "enabled:bg-fg-secondary enabled:text-surface-card enabled:hover:bg-fg-secondary enabled:hover:opacity-80",
          "dark:enabled:bg-fg-primary dark:enabled:text-surface-base dark:enabled:hover:bg-fg-primary",
          hasContent ? "opacity-100 scale-100" : "opacity-0 scale-90",
        )}
      >
        <SubmitIcon className="size-4" />
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface-card p-3 shadow-sm transition-shadow duration-normal focus-within:border-border-strong focus-within:shadow-md dark:bg-surface-raised-hover">
      <Textarea
        variant="borderless"
        autoSize
        maxRows={MAX_TEXTAREA_ROWS}
        {...{ [CHAT_COMPOSER_DATA_ATTR]: true }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={maxLength}
        rows={1}
        className="px-2 py-1"
      />
      {submitAction}
    </div>
  );
}

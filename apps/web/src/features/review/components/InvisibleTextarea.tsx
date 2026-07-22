import { Textarea } from "@nema-io/weave";

import { handleBoundaryArrowKeyDown } from "@web/features/review/digestFieldNavigation";

interface InvisibleTextareaProps {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  // 이미 해석된 값을 받는다 — 언제 감출지(포커스 게이팅 등)는 소비처마다 달라서
  // 여기서 정하지 않는다.
  placeholder?: string;
  maxLength?: number;
  className?: string;
  ref?: React.Ref<HTMLTextAreaElement>;
  onFocus?: () => void;
  onBlur?: () => void;
  // 경계 방향키(필드 간 이동)를 먼저 처리하고, 소비되지 않은 키만 넘긴다.
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function InvisibleTextarea({
  value,
  disabled,
  onChange,
  placeholder,
  maxLength,
  className,
  ref,
  onFocus,
  onBlur,
  onKeyDown,
}: InvisibleTextareaProps) {
  return (
    <Textarea
      ref={ref}
      variant="borderless"
      size="base"
      autoSize
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (handleBoundaryArrowKeyDown(e)) {
          return;
        }
        onKeyDown?.(e);
      }}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={1}
      data-nav-field
      className={className}
    />
  );
}

import { useEffect, useRef } from "react";

import { cn } from "@nema-io/weave";

import { handleBoundaryArrowKeyDown } from "@web/features/review/digestFieldNavigation";

// 보기/편집 모드를 나누지 않는 게 이 카드의 핵심 판단이라(design-decisions-log.md)
// 항상 textarea이되 평소엔 무입력 티가 없게 스타일링한다. weave에 Textarea가 없고
// `Input`은 border·h-9 같은 chrome을 base로 강제해 되돌리는 비용이 커서 raw로 쓴다.
// overflow-hidden 필수 — 없으면 JS가 높이를 맞추기 전 한 프레임 동안 네이티브
// 스크롤바가 깜빡인다. 최대 높이를 안 두는 건 의도적 — 내용이 길어도 필드가 자기
// 스크롤을 갖지 않고 페이지 스크롤에 그대로 얹힌다.
const INVISIBLE_TEXTAREA_CLASSNAME =
  "w-full min-w-0 resize-none overflow-hidden border-none bg-transparent p-0 text-base leading-relaxed text-fg-primary placeholder:text-fg-quaternary focus:outline-none disabled:text-fg-quinary";

// value뿐 아니라 폭이 바뀔 때도 다시 재야 한다 — 사이드패널이 열려 카드가 좁아지면
// 같은 텍스트라도 줄 수가 늘어 더 큰 높이가 필요한데, value만 보면 그 경우를 놓쳐
// 마지막 줄이 overflow-hidden에 잘린다. ResizeObserver는 이 코드가 바꾸는 height에도
// 반응하므로 폭이 실제로 바뀐 경우로만 좁혀 재귀 호출을 막는다.
function useAutoResizeTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useEffect(
    function resizeToContent() {
      const el = ref.current;
      if (!el) {
        return;
      }
      function resize() {
        if (!el) {
          return;
        }
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
      resize();
      let lastWidth = el.offsetWidth;
      const observer = new ResizeObserver(() => {
        if (!el || el.offsetWidth === lastWidth) {
          return;
        }
        lastWidth = el.offsetWidth;
        resize();
      });
      observer.observe(el);
      return () => observer.disconnect();
    },
    [ref, value],
  );
}

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
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(innerRef, value);

  return (
    <textarea
      ref={(el) => {
        innerRef.current = el;
        if (typeof ref === "function") {
          ref(el);
        } else if (ref) {
          ref.current = el;
        }
      }}
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
      className={cn(INVISIBLE_TEXTAREA_CLASSNAME, className)}
    />
  );
}

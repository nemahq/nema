import * as React from "react";

import { cn } from "../utils";
import {
  colorClasses,
  sizeClasses,
  type TextColor,
  type TextSize,
  type TextWeight,
  weightClasses,
} from "./Text";

type TextareaVariant = "default" | "borderless";

// default 4곳(TagAddPopover·ReferenceEditor·ReferenceCandidateCard·
// ReferenceMergeCard)이 각자 조금씩 다르게 베껴 쓰던 걸 하나로 합친 값 —
// py-1.5·disabled:text-fg-quinary·aria-invalid가 다수(4곳 중 2~3곳)였던
// 쪽으로 통일했다. aria-invalid 규칙은 안 쓰는 소비처엔 그냥 죽어있는
// 선택자라 무해하다.
const VARIANT_CLASSNAME: Record<TextareaVariant, string> = {
  default:
    "rounded-md border border-border bg-transparent px-3 py-1.5 placeholder:text-fg-quaternary focus-visible:border-brand focus-visible:outline-none aria-invalid:border-status-error disabled:text-fg-quinary disabled:placeholder:text-fg-quinary dark:focus-visible:border-fg-tertiary/70",
  // outline 관련 클래스를 일부러 안 둔다 — 전역 *:focus-visible 링(tokens/index.css)이
  // 이미 모든 포커스 가능 엘리먼트를 커버해서, 여기서 focus:outline-none을 얹으면
  // 그 전역 링을 죽이기만 하고 대체 표시가 없다(conventions.md "MUST NOT remove
  // focus styles").
  borderless:
    "border-none bg-transparent p-0 placeholder:text-fg-quaternary disabled:text-fg-quinary disabled:placeholder:text-fg-quinary",
};

interface AutoSizeOptions {
  // 최소 크기는 네이티브 rows prop이 이미 담당한다(브라우저가 알아서 처리해
  // 깜빡임이 없다) — 여기선 JS 계산이 필요한 상한만 받는다.
  maxRows?: number;
}

// autoSize(JS로 내용에 맞춰 키움)와 resize(네이티브 드래그 핸들)는 동시에
// 못 쓴다 — 둘 다 켜면 자동으로 자란 높이를 사용자가 드래그로 또 덮어써
// 서로 싸운다(Badge/Chip의 variant·color 배타 처리와 같은 이유로 유니언).
type TextareaSizing =
  | { autoSize?: boolean | AutoSizeOptions; resize?: never }
  | { autoSize?: never; resize?: "none" | "vertical" };

function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.RefObject<T | null>).current = node;
      }
    }
  };
}

// InvisibleTextarea·ChatInput이 각자 구현하던 scrollHeight 기반 리사이즈를
// 하나로 뽑았다. maxRows는 줄 수가 아니라 실제 렌더된 line-height를 매
// 렌더에서 측정해 px로 환산한다 — size prop마다 line-height가 달라서
// (Text의 sizeClasses 참고) 고정 테이블을 따로 두면 두 값이 어긋날 수 있다.
// value뿐 아니라 폭이 바뀔 때도 다시 재야 한다 — 사이드패널이 열려 필드가
// 좁아지면 같은 텍스트라도 줄 수가 늘어 더 큰 높이가 필요한데, value만 보면
// 그 경우를 놓쳐 overflow-hidden에 마지막 줄이 잘린다(InvisibleTextarea가
// 이미 겪었던 문제). ResizeObserver는 이 코드가 바꾸는 height에도 반응하므로
// 폭이 실제로 바뀐 경우로만 좁혀 재귀 호출을 막는다.
function useAutoSize(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: unknown,
  autoSize: boolean | AutoSizeOptions | undefined,
) {
  React.useEffect(
    function resizeToContent() {
      const el = ref.current;
      if (!autoSize || !el) {
        return;
      }
      const maxRows =
        typeof autoSize === "object" ? autoSize.maxRows : undefined;

      function resize() {
        if (!el) {
          return;
        }
        el.style.height = "auto";
        let next = el.scrollHeight;
        if (maxRows) {
          const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
          if (!Number.isNaN(lineHeight)) {
            next = Math.min(next, lineHeight * maxRows);
          }
        }
        el.style.height = `${next}px`;
      }

      resize();
      let lastWidth = el.offsetWidth;
      const observer = new ResizeObserver(function onResize() {
        if (!el || el.offsetWidth === lastWidth) {
          return;
        }
        lastWidth = el.offsetWidth;
        resize();
      });
      observer.observe(el);
      return function cleanup() {
        observer.disconnect();
      };
    },
    [ref, value, autoSize],
  );
}

// weave에 멀티라인 입력이 없어서(Input은 <input>이라 h-9 고정) 앱 곳곳이
// raw <textarea>를 각자 스타일링해온 걸 흡수한다. size/weight/color는
// Text와 공유해 본문 타이포와 어긋나지 않게 한다.
function Textarea({
  variant = "default",
  size = "sm",
  weight = "normal",
  color = "primary",
  autoSize,
  resize,
  className,
  value,
  ref: forwardedRef,
  ...props
}: Omit<React.ComponentPropsWithRef<"textarea">, "color"> &
  TextareaSizing & {
    variant?: TextareaVariant;
    size?: TextSize;
    weight?: TextWeight;
    color?: TextColor;
  }) {
  const internalRef = React.useRef<HTMLTextAreaElement>(null);
  useAutoSize(internalRef, value, autoSize);

  return (
    <textarea
      ref={mergeRefs(internalRef, forwardedRef)}
      data-slot="textarea"
      value={value}
      className={cn(
        sizeClasses[size],
        colorClasses[color],
        weightClasses[weight],
        VARIANT_CLASSNAME[variant],
        autoSize ? "resize-none overflow-hidden" : (resize ?? "resize-none"),
        "w-full min-w-0 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea, type TextareaVariant };

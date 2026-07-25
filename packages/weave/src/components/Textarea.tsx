import * as React from "react";

import { cn, mergeRefs } from "../utils";
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
  // focus:outline-none을 다시 둔다 — 텍스트 입력은 버튼과 달리 포커스되면
  // 깜빡이는 caret이 항상 같이 뜨는데, 이게 이미 네이티브 포커스 표시라
  // conventions.md "MUST NOT remove focus styles"가 겨냥한 상황(대체 표시가
  // 아예 없는 경우)이 아니다. 게다가 :focus-visible은 버튼류와 달리
  // input/textarea에서는 마우스 클릭에도 매칭돼(브라우저 공통 휴리스틱),
  // 지우지 않으면 "무입력 티가 없게"(#476)가 핵심인 InvisibleTextarea 등에서
  // 클릭할 때마다 사각 링이 떴다.
  borderless:
    "border-none bg-transparent p-0 placeholder:text-fg-quaternary focus:outline-none disabled:text-fg-quinary disabled:placeholder:text-fg-quinary",
};

// Tailwind 유틸리티 이름 그대로("resize-y") 매핑 — resize prop 값(예: "vertical")을
// 그대로 클래스명으로 썼다가 존재하지 않는 클래스("vertical")가 되는 버그가 있었다.
const RESIZE_CLASSNAME: Record<"none" | "vertical", string> = {
  none: "resize-none",
  vertical: "resize-y",
};

// autoSize·maxRows를 객체 하나로 묶지 않고 평평한 두 prop으로 둔다 — 인라인
// 객체 리터럴(예: ChatInput의 autoSize={{maxRows: 10}})은 매 렌더 새 identity를
// 만들어 아래 useAutoSize의 effect가 매 렌더(타이핑할 때마다) 재실행된다
// (conventions.md 데이터 prop 원시값 규칙, Chip의 remove와 같은 이유).
type TextareaSizing =
  | { autoSize?: boolean; maxRows?: number; resize?: never }
  | { autoSize?: never; maxRows?: never; resize?: "none" | "vertical" };

// InvisibleTextarea·ChatInput이 각자 구현하던 scrollHeight 기반 리사이즈를
// 하나로 뽑았다. maxRows는 줄 수가 아니라 실제 렌더된 line-height를 매
// 렌더에서 측정해 px로 환산한다 — size prop마다 line-height가 달라서
// (Text의 sizeClasses 참고) 고정 테이블을 따로 두면 두 값이 어긋날 수 있다.
// 전역이 box-sizing: border-box라(tailwindcss preflight) style.height는
// padding을 포함한 값을 기대하는데 lineHeight*maxRows는 content만이라,
// padding을 더해줘야 실제로 요청한 줄 수만큼 보인다.
// value뿐 아니라 폭이 바뀔 때도 다시 재야 한다 — 사이드패널이 열려 필드가
// 좁아지면 같은 텍스트라도 줄 수가 늘어 더 큰 높이가 필요한데, value만 보면
// 그 경우를 놓쳐 overflow-hidden에 마지막 줄이 잘린다(InvisibleTextarea가
// 이미 겪었던 문제). ResizeObserver는 이 코드가 바꾸는 height에도 반응하므로
// 폭이 실제로 바뀐 경우로만 좁혀 재귀 호출을 막는다.
function useAutoSize(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: unknown,
  autoSize: boolean | undefined,
  maxRows: number | undefined,
) {
  React.useEffect(
    function resizeToContent() {
      const el = ref.current;
      if (!autoSize || !el) {
        return;
      }

      function resize() {
        if (!el) {
          return;
        }
        el.style.height = "auto";
        let next = el.scrollHeight;
        if (maxRows) {
          const style = getComputedStyle(el);
          const lineHeight = parseFloat(style.lineHeight);
          const verticalPadding =
            parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
          if (!Number.isNaN(lineHeight)) {
            const cap = lineHeight * maxRows + verticalPadding;
            // 클래스의 overflow-hidden은 "자라는 동안 스크롤바 깜빡임 방지"용이지,
            // 상한에 닿은 뒤에도 유효한 게 아니다 — 안 넘치면 그대로 hidden(스크롤
            // 없이 자라기만), 상한을 넘기면 인라인 스타일로 auto를 얹어 안에서
            // 스크롤할 수 있게 한다(인라인이 클래스보다 우선).
            el.style.overflowY = next > cap ? "auto" : "hidden";
            next = Math.min(next, cap);
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
    [ref, value, autoSize, maxRows],
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
  maxRows,
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
  useAutoSize(internalRef, value, autoSize, maxRows);

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
        autoSize
          ? "resize-none overflow-hidden"
          : RESIZE_CLASSNAME[resize ?? "none"],
        "w-full min-w-0 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea, type TextareaVariant };

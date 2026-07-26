import type { ComponentProps } from "react";

import { cn } from "../utils";

export type TabIndicatorSide = "top" | "bottom";
export type TabSize = "default";

// 활성 탭임을 나타내는 amber 밑줄 색 — 보더가 버튼 밖 wrapper(닫기 버튼까지
// 포함한 영역)에 걸쳐야 하는 소비처(TabbedPanel)는 아래 Tab 컴포넌트 대신
// 이 토큰들을 자기 wrapper에 직접 입힌다.
export const TAB_INDICATOR_SIDE_CLASSNAME: Record<TabIndicatorSide, string> = {
  top: "border-t-2 -mt-px",
  bottom: "border-b-2 -mb-px",
};

export const TAB_ACTIVE_INDICATOR_CLASSNAME: Record<TabIndicatorSide, string> =
  {
    top: "border-t-amber-600 dark:border-t-amber-500",
    bottom: "border-amber-600 dark:border-amber-500",
  };

export const TAB_DIMMED_ACTIVE_INDICATOR_CLASSNAME: Record<
  TabIndicatorSide,
  string
> = {
  top: "border-t-border",
  bottom: "border-border",
};

interface TabProps extends ComponentProps<"button"> {
  active: boolean;
  size?: TabSize;
}

const SIZE_CLASSNAME: Record<TabSize, string> = {
  default: "px-3 py-2",
};

// 고정 개수의 뷰를 전환하는 밑줄 탭(예: Space 개요의 topic/changesets 전환) 전용.
// 열고 닫고 드래그로 재정렬하는 문서 탭(TabbedPanel)은 DOM 구조 자체가 달라서
// 이 컴포넌트를 안 쓰고 위 색 토큰만 가져다 쓴다.
export function Tab({
  active,
  size = "default",
  className,
  children,
  ...props
}: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "flex items-center gap-1.5 text-sm font-medium transition-colors duration-fast",
        SIZE_CLASSNAME[size],
        TAB_INDICATOR_SIDE_CLASSNAME.bottom,
        active
          ? cn("text-fg-primary", TAB_ACTIVE_INDICATOR_CLASSNAME.bottom)
          : "border-transparent text-fg-tertiary hover:text-fg-secondary",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

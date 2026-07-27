import type { ComponentProps } from "react";

import { cn } from "../utils";

// 활성 탭임을 나타내는 amber 밑줄 색 — 위쪽 보더로 표현해야 하는 소비처
// (TabbedPanel, 닫기 버튼까지 포함한 wrapper에 걸어야 해서 Tab을 못 씀)가
// 재사용한다. Tab 자신은 이 값을 border가 아니라 절대위치 span의 배경색으로
// 다시 쓴다(아래 함수 참고) — 색은 하나인데 표현 방식(border-t vs bg)이
// 소비처마다 달라 원시값만 공유한다.
export const TAB_ACTIVE_INDICATOR_CLASSNAME =
  "border-t-amber-600 dark:border-t-amber-500";

export const TAB_DIMMED_ACTIVE_INDICATOR_CLASSNAME = "border-t-border";

interface TabProps extends ComponentProps<"button"> {
  active: boolean;
}

// 고정 개수의 뷰를 전환하는 밑줄 탭(예: Space 개요의 topic/changesets 전환) 전용.
// 열고 닫고 드래그로 재정렬하는 문서 탭(TabbedPanel)은 DOM 구조 자체가 달라서
// 이 컴포넌트를 안 쓰고 위 색 토큰만 가져다 쓴다.
//
// hover 배경(pill)과 밑줄(amber)을 같은 엘리먼트의 border-radius/border로
// 같이 표현하면 밑줄 양 끝이 pill의 둥근 모서리를 따라 같이 휘어 버린다 —
// 그래서 둘을 별개의 절대위치 span으로 분리해 서로의 모양에 영향을 안 준다.
//
// role="tab"은 일부러 안 준다 — 유일한 소비처(SpaceTabs)의 부모가
// role="tablist"가 아니라서, 반쪽 ARIA(tab인데 방향키 탐색·aria-controls는
// 없음)는 ARIA 트리에서 무효 취급되거나 스크린리더에 오히려 혼란을 준다.
// 소비처가 완전한 tablist 패턴을 구현할 때 role을 직접 얹는 게 맞다.
export function Tab({ active, className, children, ...props }: TabProps) {
  return (
    <button
      type="button"
      className={cn(
        "group relative isolate flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors duration-fast",
        active ? "text-fg-primary" : "text-fg-tertiary hover:text-fg-secondary",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="absolute inset-1 -z-10 rounded-md transition-colors duration-fast group-hover:bg-surface-raised-hover/75"
      />
      {children}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 -bottom-px h-0.5",
          active && "bg-amber-600 dark:bg-amber-500",
        )}
      />
    </button>
  );
}

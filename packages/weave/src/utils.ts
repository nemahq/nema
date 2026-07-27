import { type ClassValue, clsx } from "clsx";
import type * as React from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 컴포넌트 내부에서 쓸 ref(측정·이벤트 바인딩 등)와 호출부가 넘긴 ref를 같은
// DOM 노드에 함께 붙여야 할 때 쓴다 — 하나의 JSX 엘리먼트는 ref를 하나만 받는다.
export function mergeRefs<T>(
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

// DropdownMenu/Select처럼 서로 다른 Radix primitive(액션 메뉴 vs 폼 컨트롤)를 쓰지만
// 화면에 떠 있는 표면(배경·보더·그림자)만큼은 같은 룩이어야 하는 팝업 콘텐츠가
// 공유하는 표면 스타일. 보더는 라이트·다크 공통, 그림자는 라이트에서만(다크는
// 보더만으로 경계를 표현). 배경은 surface-overlay 전용 토큰 — 라이트는 card와
// 같은 흰색이지만, 다크는 LNB·메인·사이드뷰 어디와도 안 겹치는 새 톤이다.
export const POPOVER_SURFACE_CLASSNAME =
  "rounded-md border border-border/50 bg-surface-overlay text-fg-primary shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-none";

// 이미 자체적으로 호버 반응하는 표면(카드·행) 안에 얹힌 작은 액션 아이콘이 그
// 부모와 같은 톤(surface-raised-hover)만으로는 구분이 잘 안 돼서, 밝기 필터를
// 더해 신호를 분리한다. 다크에서 방향이 반대(밝게)인 이유: 어둡게 하면 오히려
// 배경 쪽으로 가까워져 구분이 더 흐려지기 때문.
const NESTED_HOVER_ICON_TONE =
  "bg-surface-raised-hover brightness-95 dark:brightness-125";

export const NESTED_HOVER_ICON_CLASSNAME = NESTED_HOVER_ICON_TONE.split(" ")
  .map((cls) =>
    cls.startsWith("dark:") ? `dark:hover:${cls.slice(5)}` : `hover:${cls}`,
  )
  .join(" ");

// hover를 안 하고 있어도 같은 톤을 강제로 재현해야 하는 경우(HoverIcon의
// active prop 등)를 위해, hover: 접두사 없는 원시값을 그대로 노출한다 —
// 위 CLASSNAME과 같은 원본에서 파생되므로 값이 갈릴 일이 없다.
export const NESTED_ACTIVE_ICON_CLASSNAME = NESTED_HOVER_ICON_TONE;

// 클릭 가능한 리스트 항목(초안 카드, 변경사항 행 등)이 공유하는 호버 반응 —
// 경계(보더 유무)는 콘텐츠 성격(임시 vs 영구 기록)에 따라 갈리지만, 호버
// 톤만큼은 앱 전체에서 하나로 맞춘다.
export const LIST_ITEM_HOVER_CLASSNAME =
  "rounded-lg transition-colors duration-fast hover:bg-surface-raised-hover/40";

// Select/DropdownMenu 옵션이 동적으로 늘어나 스크롤 없이는 현재 선택을 찾기
// 어려워지는 목록(예: 카탈로그, Space 목록)에서만 쓴다. 순서 자체가 의미(분류·
// 우선순위)를 가진 고정 소수 옵션 목록에는 적용하지 않는다 — 재배치가 그 의미를
// 깨뜨린다.
export function pinSelectedToTop<T>(
  items: T[],
  isSelected: (item: T) => boolean,
): T[] {
  const index = items.findIndex(isSelected);
  if (index <= 0) {
    return items;
  }
  const next = [...items];
  const [selected] = next.splice(index, 1);
  next.unshift(selected);
  return next;
}

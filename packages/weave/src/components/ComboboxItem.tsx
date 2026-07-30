import type { ComponentProps, ReactNode } from "react";

import { cn, LIST_ITEM_HOVER_CLASSNAME } from "../utils";

// disabled/readOnly를 판별 유니언으로 묶으면 실제 배타성을 타입으로
// 강제할 수 있지만(Chip의 remove, Textarea의 autoSize/resize와 같은 결),
// Omit<ComponentProps<"button">>처럼 큰 타입과 판별 유니언을 교차한 채
// JSX props로 쓰면 TS가 유니언을 제대로 분배 못 해 위양성 에러가 난다(격리
// 재현 완료 — 유니언·오버로드 둘 다 실패). 그래서 배타성은 주석으로만 문서화한다.
interface ComboboxItemProps extends Omit<
  ComponentProps<"button">,
  "className"
> {
  // 고를 수도 없고 더 볼 것도 없는 행이면 true — 네이티브 disabled로 통째로
  // 죽인다. readOnly와 동시에 켜지 않는다 — 네이티브 disabled가 wrapper의
  // pointer-events까지 끊어서, 옆에 계속 눌려야 하는 actions까지 죽는다.
  disabled?: boolean;
  // 이미 붙은 라벨처럼 다시 고를 수는 없지만, 오른쪽 액션(편집 등)은 계속 눌러야
  // 하는 행이면 true — aria-disabled로만 막아 hover·형제 actions는 살려둔다
  // (네이티브 disabled는 그걸 못 해서 못 쓴다).
  readOnly?: boolean;
  // 행 안쪽 버튼과 별개로 오른쪽에 뜨는 액션 — 클릭 영역이 이미 button이라
  // 그 안에 중첩 button을 못 넣어서 형제로 둔다.
  actions?: ReactNode;
  buttonClassName?: string;
}

export function ComboboxItem({
  disabled = false,
  readOnly = false,
  actions,
  buttonClassName,
  onClick,
  children,
  ...props
}: ComboboxItemProps) {
  return (
    <div
      className={cn(
        "group flex w-full items-center px-2",
        !disabled && LIST_ITEM_HOVER_CLASSNAME,
        // actions 안의 HoverIcon(미트볼 등)이 active(data-active)면 마우스가
        // 행을 벗어나도 행 배경을 계속 hover와 같은 톤으로 유지한다. group-has-
        // 가 아니라 has-를 쓴다 — group-has-는 "그룹의 자손"에게 입혀야 컴파일된
        // 셀렉터(`:has(...) *`)가 성립하는데, 이 div 자신이 곧 그 group이라 자기
        // 자신에게 group-has-를 걸면 절대 매칭될 수 없다(NavItem은 group div와
        // 스타일 대상 div가 서로 다른 요소라 group-has-가 맞다 — 그쪽과 다른 구조).
        !disabled && "has-[[data-active=true]]:bg-surface-raised-hover/40",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-disabled={readOnly || undefined}
        tabIndex={readOnly ? -1 : undefined}
        onClick={readOnly ? undefined : onClick}
        className={cn(
          "flex min-w-0 flex-1 items-center truncate py-1 text-left",
          "disabled:text-fg-quinary",
          "aria-disabled:cursor-default",
          buttonClassName,
        )}
        {...props}
      >
        {children}
      </button>
      {actions}
    </div>
  );
}

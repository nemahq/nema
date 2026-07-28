import type { ComponentProps, ReactNode } from "react";

import { cn, LIST_ITEM_HOVER_CLASSNAME } from "../utils";

// disabled/active/readOnly를 판별 유니언으로 묶으면 실제 배타성을 타입으로
// 강제할 수 있지만(Chip의 remove, Textarea의 autoSize/resize와 같은 결),
// Omit<ComponentProps<"button">>처럼 큰 타입과 판별 유니언을 교차한 채
// JSX props로 쓰면 TS가 유니언을 제대로 분배 못 해 위양성 에러가 난다(격리
// 재현 완료 — 유니언·오버로드 둘 다 실패). 그래서 배타성은 주석으로만 문서화한다.
interface ComboboxItemProps extends Omit<
  ComponentProps<"button">,
  "className"
> {
  // 고를 수도 없고 더 볼 것도 없는 행이면 true — 네이티브 disabled로 통째로
  // 죽인다. active·readOnly와 동시에 켜지 않는다 — 네이티브 disabled가 wrapper의
  // pointer-events까지 끊어서, 옆에 계속 눌려야 하는 actions까지 죽는다.
  disabled?: boolean;
  // 지금 선택된 값임을 시각적으로만 강조 — 클릭은 막지 않는다(색 피커처럼
  // "현재 값이지만 계속 다시 고를 수 있는" 행용). readOnly와 달리 onClick이
  // 그대로 살아있다.
  active?: boolean;
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
  active = false,
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
        "group flex w-full items-center",
        !disabled && LIST_ITEM_HOVER_CLASSNAME,
        // LIST_ITEM_HOVER_CLASSNAME과 다른 색 축(surface-raised-hover가 아니라
        // fg-primary 틴트)을 써야 한다 — 같은 값을 쓰면 다른 행에 마우스를
        // 올렸을 때와 실제 active 행을 구분할 수 없다.
        active && "bg-fg-primary/10",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-disabled={readOnly || undefined}
        aria-pressed={active || undefined}
        tabIndex={readOnly ? -1 : undefined}
        onClick={readOnly ? undefined : onClick}
        className={cn(
          "flex min-w-0 flex-1 items-center truncate text-left",
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

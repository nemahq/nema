import type { ComponentProps, ReactNode } from "react";

import { cn, LIST_ITEM_HOVER_CLASSNAME } from "../utils";

interface ComboboxItemProps extends Omit<ComponentProps<"button">, "disabled"> {
  disabled?: boolean;
  // 이미 붙은 항목처럼 클릭은 막되 hover(설명 재확인 등)는 계속 가능해야 하는
  // 행에서 true로 준다 — 네이티브 disabled 대신 aria-disabled + onClick
  // 무력화로 처리해, disabled의 기본 pointer-events:none을 피한다.
  keepHoverWhenDisabled?: boolean;
  // 행 안쪽 버튼과 별개로 오른쪽에 뜨는 액션(편집·삭제 등) — 행 전체가 이미
  // button이라 그 안에 중첩 button을 못 넣어서 형제로 둔다.
  actions?: ReactNode;
  rowClassName?: string;
}

export function ComboboxItem({
  disabled = false,
  keepHoverWhenDisabled = false,
  actions,
  rowClassName,
  className,
  onClick,
  children,
  ...props
}: ComboboxItemProps) {
  const nativeDisabled = disabled && !keepHoverWhenDisabled;
  const ariaDisabled = disabled && keepHoverWhenDisabled;

  return (
    <div
      className={cn(
        "group flex w-full items-center",
        LIST_ITEM_HOVER_CLASSNAME,
        nativeDisabled && "pointer-events-none",
        rowClassName,
      )}
    >
      <button
        type="button"
        disabled={nativeDisabled}
        aria-disabled={ariaDisabled}
        // aria-disabled는 네이티브 disabled와 달리 브라우저가 알아서 tab 순서에서
        // 빼주지 않는다 — 포커스는 그대로 잡히는데 disabled용 포커스 스타일은
        // 없어서, 직접 tab 순서에서 뺀다(design-qa-checklist.md 포커스 규칙).
        tabIndex={ariaDisabled ? -1 : undefined}
        onClick={ariaDisabled ? undefined : onClick}
        className={cn(
          "flex min-w-0 flex-1 items-center truncate text-left",
          "disabled:pointer-events-none disabled:text-fg-quinary",
          ariaDisabled && "cursor-default",
          className,
        )}
        {...props}
      >
        {children}
      </button>
      {actions}
    </div>
  );
}

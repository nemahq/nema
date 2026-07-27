import { type ComponentProps, forwardRef } from "react";

import { cn, NESTED_HOVER_ICON_CLASSNAME } from "../utils";

interface HoverIconProps extends ComponentProps<"button"> {
  // 이 아이콘이 트리거하는 게 열려 있는 등, hover를 안 하고 있어도 hover와
  // 같은 톤을 강제로 유지해야 할 때 true로 준다. data-state가 아니라 별도
  // prop인 이유는 Tooltip+DropdownMenu처럼 트리거가 겹쳐 data-state를 못
  // 믿는 경우가 있어서다(SpaceItemMenu 참고). data-active로도 노출해 조상이
  // group-has-[[data-active=true]]로 구독할 수 있게 한다.
  active?: boolean;
}

// 이미 자체적으로 hover 반응하는 표면(카드·행·LNB 아이템) 위에 겹쳐 뜨는 작은 액션
// 아이콘. 기본은 투명하고 포커스 시에만 보이며, 어느 조상의 hover 상태에 반응해
// 나타날지는 소비처가 className으로 직접 준다(group-hover, group-hover/name 등
// 컨텍스트마다 달라서 컴포넌트가 강제할 수 없다).
export const HoverIcon = forwardRef<HTMLButtonElement, HoverIconProps>(
  function HoverIcon(
    { className, type = "button", active = false, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        data-active={active || undefined}
        className={cn(
          // text-fg-tertiary: 아이콘 자체(lucide)는 stroke가 기본 currentColor라
          // 자기 색을 안 정하면 여기서 상속받는다 — hover/active는 배경(아래
          // NESTED_HOVER_ICON_CLASSNAME)만으로 표현하고 색은 그대로 둔다.
          "flex size-5 shrink-0 items-center justify-center rounded-md text-fg-tertiary opacity-0 transition-colors duration-fast focus-visible:opacity-100",
          NESTED_HOVER_ICON_CLASSNAME,
          active &&
            "bg-surface-raised-hover opacity-100 brightness-95 dark:brightness-125",
          className,
        )}
        {...props}
      />
    );
  },
);

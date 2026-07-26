import { type ComponentProps, forwardRef } from "react";

import { cn, NESTED_HOVER_ICON_CLASSNAME } from "../utils";

// 이미 자체적으로 hover 반응하는 표면(카드·행·LNB 아이템) 위에 겹쳐 뜨는 작은 액션
// 아이콘. 기본은 투명하고 포커스 시에만 보이며, 어느 조상의 hover/열림 상태에
// 반응해 나타날지는 소비처가 className으로 직접 준다(group-hover, group-hover/name,
// data-[state=open] 등 컨텍스트마다 달라서 컴포넌트가 강제할 수 없다).
export const HoverIcon = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button">
>(function HoverIcon({ className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md opacity-0 transition-colors duration-fast focus-visible:opacity-100",
        NESTED_HOVER_ICON_CLASSNAME,
        className,
      )}
      {...props}
    />
  );
});

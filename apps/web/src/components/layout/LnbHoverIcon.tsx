import { type ComponentProps, forwardRef } from "react";

import { cn, NESTED_HOVER_ICON_CLASSNAME } from "@nema-io/weave";

// LNB 행 위에 겹쳐 뜨는 우측 액션 아이콘(Space "...", 섹션 "+", 접기 토글) 공통 스타일.
export const LnbHoverIcon = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button">
>(function LnbHoverIcon({ className, type = "button", ...props }, ref) {
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

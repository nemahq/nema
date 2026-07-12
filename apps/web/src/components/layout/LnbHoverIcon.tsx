import { type ComponentProps, forwardRef } from "react";

import { cn } from "@nema-io/weave";

// LNB 행 위에 겹쳐 뜨는 우측 액션 아이콘(Space "...", 섹션 "+", 접기 토글) 공통
// 스타일 — 라이트에서 brightness-95(어둡게), 다크에서 brightness-125(밝게)로
// 방향이 반대인 이유: 둘 다 같은 토큰(surface-raised-hover)을 쓰는데, 다크에서
// 어둡게 하면 오히려 배경 쪽으로 가까워져 구분이 흐려진다.
export const LnbHoverIcon = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button">
>(function LnbHoverIcon({ className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md opacity-0 transition-colors duration-fast hover:bg-surface-raised-hover hover:brightness-95 focus-visible:opacity-100 dark:hover:brightness-125",
        className,
      )}
      {...props}
    />
  );
});

import { type ReactNode } from "react";

import { cn, Slot } from "@nema-io/weave";

interface LnbRowBoxProps {
  asChild?: boolean;
  className?: string;
  children: ReactNode;
}

// NavItem(펼침 행)과 LnbSection(라벨 행)이 시각적으로 같은 박스여야 해서 공유한다
// — 높이·radius·패딩이 각자 파일에 따로 적혀 있으면 한쪽만 바뀌었을 때 어긋난다.
export function LnbRowBox({ asChild, className, children }: LnbRowBoxProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      className={cn(
        "flex h-7 w-full items-center gap-1.5 truncate rounded-lg px-2.5 text-xs font-medium transition-colors duration-fast",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../utils";

const ORIENTATION_CLASSNAME: Record<"horizontal" | "vertical", string> = {
  horizontal: "h-px w-full",
  vertical: "h-full w-px",
};

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  // 방향 분기를 data-[orientation=*] 대신 JS로 가른다 — Tailwind가 이 variant를
  // 클래스+속성 복합 선택자로 컴파일해 특이도가 (0,2,0)이 되고, 소비처가 넘긴
  // 평범한 w-auto(0,1,0)가 진다. tailwind-merge도 variant가 달라 둘을 충돌로
  // 안 봐서 둘 다 남는다(인셋 구분선을 못 만든다).
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border-subtle",
        ORIENTATION_CLASSNAME[orientation],
        className,
      )}
      {...props}
    />
  );
}

export { Separator };

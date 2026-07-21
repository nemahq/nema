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
  // 방향 분기를 data-[orientation=*] 대신 JS로 가른다 — 속성 선택자는 특이도가
  // 유틸리티 클래스보다 높아 소비처의 w-auto가 base의 w-full에 지고,
  // tailwind-merge도 variant가 달라 둘을 충돌로 안 본다(인셋 구분선을 못 만든다).
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

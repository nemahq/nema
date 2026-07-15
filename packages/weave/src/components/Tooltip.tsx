"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../utils";

const DEFAULT_TOOLTIP_DELAY_MS = 300;

function TooltipProvider({
  delayDuration = DEFAULT_TOOLTIP_DELAY_MS,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          // 라이트 모드에서만 반전(어두운 배경)하고, 다크 모드는 원래 값(다크
          // 팔레트의 surface-tooltip/fg-primary) 그대로 — 우연히 둘 다 같은
          // 다크 팔레트 값으로 수렴해서 테마 무관하게 고정값을 쓴다. surface-tooltip
          // (stone-950)은 너무 진해서 한 톤 옅은 surface-card(stone-800)를 쓴다.
          "z-50 w-fit rounded-md bg-[var(--palette-dark-surface-card)] px-2 py-1 text-[11px] text-balance text-[var(--palette-dark-fg-primary)] shadow-none dark:border dark:border-border",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { useEscapeAwareCloseFocus } from "../hooks/useEscapeAwareCloseFocus";
import { cn } from "../utils";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  onEscapeKeyDown,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const escapeAwareCloseFocus = useEscapeAwareCloseFocus(
    onEscapeKeyDown,
    onCloseAutoFocus,
  );
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        {...escapeAwareCloseFocus}
        className={cn(
          "z-50 w-72 rounded-md border border-border bg-surface-card p-2 text-fg-primary shadow-[0_4px_16px_rgba(0,0,0,0.12)] outline-none dark:shadow-[0_4px_16px_rgba(0,0,0,0.5)]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };

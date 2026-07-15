"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { useEscapeAwareCloseFocus } from "../hooks/useEscapeAwareCloseFocus";
import { cn, POPOVER_SURFACE_CLASSNAME } from "../utils";

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
          POPOVER_SURFACE_CLASSNAME,
          "z-50 w-72 p-2 outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };

"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { useEscapeAwareCloseFocus } from "../hooks/useEscapeAwareCloseFocus";
import { usePopoverScrollLock } from "../hooks/usePopoverScrollLock";
import { cn, mergeRefs, POPOVER_SURFACE_CLASSNAME } from "../utils";

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
  ref: forwardedRef,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const escapeAwareCloseFocus = useEscapeAwareCloseFocus(
    onEscapeKeyDown,
    onCloseAutoFocus,
  );
  const scrollLockRef =
    usePopoverScrollLock<React.ComponentRef<typeof PopoverPrimitive.Content>>();
  // mergeRefs(...)를 인라인으로 새로 만들면 매 렌더 identity가 바뀌어 React가
  // 콜백 ref를 매번 null→재부착으로 재실행한다 — scrollLockRef가 그때마다
  // 리스너를 떼었다 다는 낭비를 하지 않도록 고정한다.
  const mergedContentRef = React.useMemo(
    () => mergeRefs(scrollLockRef, forwardedRef),
    [scrollLockRef, forwardedRef],
  );
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={mergedContentRef}
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

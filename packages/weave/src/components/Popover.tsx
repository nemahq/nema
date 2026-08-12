"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { useEscapeAwareCloseFocus } from "../hooks/useEscapeAwareCloseFocus";
import { usePopoverScrollLock } from "../hooks/usePopoverScrollLock";
import { cn, mergeRefs, POPOVER_SURFACE_CLASSNAME } from "../utils";

// Radix 자체 기본값(false)이 아니라 true로 강제한다 — 이 팝오버가 열려 있는
// 동안은 body pointer-events:none이 걸려, 옆의 dropdown 트리거를 눌러도 그
// 클릭이 dropdown에 아예 안 닿는다. "새 레이어가 뜨며 이 팝오버의 바깥 클릭
// 판정과 경합"하는 상황 자체가 생기지 않는다(경합에서 이기는 게 아니라 경합할
// 조건을 없앤다). staging 실측 확인(2026-08-05).
function Popover({
  modal = true,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" modal={modal} {...props} />;
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

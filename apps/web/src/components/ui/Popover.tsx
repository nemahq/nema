import { type ComponentProps, useState } from "react";

import { Popover as WeavePopover } from "@nema-io/weave";

import { useOverlayOpenGuard } from "@web/lib/command/shortcut/useOverlayOpenGuard";

// Dialog.tsx와 달리 open을 prop으로 받지 않고 onOpenChange를 가로채 자체
// state로 추적한다 — 대부분의 호출부가 uncontrolled로 쓰기 때문.
export function Popover({
  onOpenChange,
  ...props
}: ComponentProps<typeof WeavePopover>) {
  const [open, setOpen] = useState(false);
  useOverlayOpenGuard(open);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  return <WeavePopover onOpenChange={handleOpenChange} {...props} />;
}

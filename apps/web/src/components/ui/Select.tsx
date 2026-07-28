import { type ComponentProps, useState } from "react";

import { Select as WeaveSelect } from "@nema-io/weave";

import { useOverlayOpenGuard } from "@web/lib/command/shortcut/useOverlayOpenGuard";

// Dialog.tsx와 달리 open을 prop으로 받지 않고 onOpenChange를 가로채 자체
// state로 추적한다 — 대부분의 호출부가 uncontrolled로 쓰기 때문.
export function Select({
  onOpenChange,
  ...props
}: ComponentProps<typeof WeaveSelect>) {
  const [open, setOpen] = useState(false);
  useOverlayOpenGuard(open);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  return <WeaveSelect onOpenChange={handleOpenChange} {...props} />;
}

import { type ComponentProps, useState } from "react";

import { Popover as WeavePopover } from "@nema-io/weave";

import { useOverlayOpenGuard } from "@web/lib/command/shortcut/useOverlayOpenGuard";

// 가드는 항상 실제 open 값(controlled면 prop, uncontrolled면 자체 state)을
// 봐야 한다 — onOpenChange만 보면 controlled 호출부가 Radix를 거치지 않고
// (예: 성공 콜백에서) open prop을 직접 false로 바꿨을 때 그 이벤트가 안 잡혀
// 가드가 영구히 열림으로 고정된다(TagAddPopover가 이 경로를 탄다).
export function Popover({
  open,
  onOpenChange,
  ...props
}: ComponentProps<typeof WeavePopover>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  useOverlayOpenGuard(open ?? uncontrolledOpen);

  function handleOpenChange(next: boolean) {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  return (
    <WeavePopover open={open} onOpenChange={handleOpenChange} {...props} />
  );
}

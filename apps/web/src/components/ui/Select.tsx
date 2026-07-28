import { type ComponentProps, useState } from "react";

import { Select as WeaveSelect } from "@nema-io/weave";

import { useOverlayOpenGuard } from "@web/lib/command/shortcut/useOverlayOpenGuard";

// 가드는 항상 실제 open 값(controlled면 prop, uncontrolled면 자체 state)을
// 봐야 한다 — onOpenChange만 보면 controlled 호출부가 Radix를 거치지 않고
// open prop을 직접 바꿨을 때 그 이벤트가 안 잡혀 가드가 영구히 열림으로
// 고정된다(Popover.tsx의 TagAddPopover 사례 참고).
export function Select({
  open,
  onOpenChange,
  ...props
}: ComponentProps<typeof WeaveSelect>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  useOverlayOpenGuard(open ?? uncontrolledOpen);

  function handleOpenChange(next: boolean) {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  return <WeaveSelect open={open} onOpenChange={handleOpenChange} {...props} />;
}

import { type ComponentProps } from "react";

import { Dialog as WeaveDialog } from "@nema-io/weave";

import { useOverlayOpenGuard } from "@web/lib/command/shortcut/useOverlayOpenGuard";

// weave Dialog를 그대로 감싸되 open 상태를 단축키 레지스트리에 알린다 — 이
// 컴포넌트로 만든 모달은 열려있는 동안 자동으로 전역 단축키를 양보시킨다.
// DialogContent/DialogHeader 등 나머지 서브컴포넌트는 weave에서 그대로 쓴다.
export function Dialog({ open, ...props }: ComponentProps<typeof WeaveDialog>) {
  useOverlayOpenGuard(!!open);
  return <WeaveDialog open={open} {...props} />;
}

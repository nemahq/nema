import { useEffect } from "react";

import { useActionRegistry } from "./context";

// 이 오버레이가 열려있는 동안 global scope 단축키를 자동으로 양보시킨다
// (useRegisterAction 참고) — 오버레이 컴포넌트가 배후 단축키를 하나하나 알 필요 없다.
export function useOverlayOpenGuard(open: boolean) {
  const { pushOverlay, popOverlay } = useActionRegistry();

  useEffect(
    function guardWhileOpen() {
      if (!open) {
        return;
      }
      pushOverlay();
      return () => popOverlay();
    },
    [open, pushOverlay, popOverlay],
  );
}

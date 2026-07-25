import { useEffect } from "react";

import { useActionRegistry } from "./context";

// 이 모달이 열려있는 동안 global scope 단축키를 자동으로 양보시킨다
// (useRegisterAction 참고) — 모달 컴포넌트가 배후 단축키를 하나하나 알 필요 없다.
export function useModalOpenGuard(open: boolean) {
  const { pushModal, popModal } = useActionRegistry();

  useEffect(
    function guardWhileOpen() {
      if (!open) {
        return;
      }
      pushModal();
      return () => popModal();
    },
    [open, pushModal, popModal],
  );
}

import { useEffect, useState } from "react";

const DEFAULT_PENDING_DELAY_MS = 250;
const IMMEDIATE_RESET_MS = 0;

export function usePendingAfterDelay(
  isPending: boolean,
  delayMs = DEFAULT_PENDING_DELAY_MS,
): boolean {
  const [pending, setPending] = useState(false);

  useEffect(
    function scheduleDelayedPending() {
      // setPending을 effect 본문에서 동기 호출하면 react-compiler 린트에 걸려
      // (cascading render 경고) 두 분기 다 setTimeout 콜백 안에서 부른다.
      if (!isPending) {
        const resetTimer = setTimeout(
          () => setPending(false),
          IMMEDIATE_RESET_MS,
        );
        return () => clearTimeout(resetTimer);
      }

      const revealTimer = setTimeout(() => setPending(true), delayMs);
      return () => clearTimeout(revealTimer);
    },
    [isPending, delayMs],
  );

  return pending;
}

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
      const resetTimer = setTimeout(
        () => setPending(false),
        IMMEDIATE_RESET_MS,
      );
      const revealTimer = isPending
        ? setTimeout(() => setPending(true), delayMs)
        : undefined;

      return () => {
        clearTimeout(resetTimer);
        if (revealTimer !== undefined) {
          clearTimeout(revealTimer);
        }
      };
    },
    [isPending, delayMs],
  );

  return pending;
}

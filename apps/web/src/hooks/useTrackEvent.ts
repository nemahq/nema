import { useCallback } from "react";

import { posthog } from "@web/lib/posthog";

export function useTrackEvent() {
  return useCallback(
    (
      type: string,
      sessionId: string | null = null,
      payload: Record<string, unknown> = {},
    ) => {
      posthog.capture(type, { session_id: sessionId, ...payload });
    },
    [],
  );
}

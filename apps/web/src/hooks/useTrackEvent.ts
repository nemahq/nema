import { useCallback } from "react";

import { trpc } from "@web/lib/trpc";

export function useTrackEvent() {
  const { mutate } = trpc.event.track.useMutation({
    onError: () => {
      // 분석 이벤트 실패는 사용자에게 노출하지 않음
    },
  });

  return useCallback(
    (
      type: string,
      sessionId: string | null = null,
      payload: Record<string, unknown> = {},
    ) => {
      mutate({ type, sessionId, payload });
    },
    [mutate],
  );
}

import { trpc } from "@web/lib/trpc";

export function useTrackEvent() {
  const { mutate } = trpc.event.track.useMutation();

  return (
    type: string,
    sessionId: string | null = null,
    payload: Record<string, unknown> = {},
  ) => {
    mutate({ type, sessionId, payload });
  };
}

import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { trpc } from "@web/lib/trpc";

import { removeSessionCache } from "./useSessionList";

export function useDeleteSession() {
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();

  return trpc.session.delete.useMutation({
    onSuccess(_, { sessionId }) {
      trackEvent("session.delete", sessionId);
      removeSessionCache(utils, sessionId);
    },
  });
}

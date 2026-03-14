import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { trpc } from "@web/lib/trpc";

import { updateSessionCache } from "./useSessionList";

export function useUpdateSession() {
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();

  return trpc.session.update.useMutation({
    onSuccess(updatedSession) {
      trackEvent("session.update", updatedSession.id);
      updateSessionCache(utils, updatedSession);
    },
  });
}

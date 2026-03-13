import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { trpc } from "@web/lib/trpc";

import { prependSessionCache } from "./useSessionList";

export function useCreateSession() {
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();

  return trpc.session.create.useMutation({
    onSuccess(newSession) {
      trackEvent("session.create", newSession.id);
      prependSessionCache(utils, newSession);
    },
  });
}

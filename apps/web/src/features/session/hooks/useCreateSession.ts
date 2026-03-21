import { trackEvent } from "@web/lib/posthog/trackEvent";
import { trpc } from "@web/lib/trpc";

import { clearMessageCache, presetMessageCache } from "./useMessageList";
import { prependSessionCache } from "./useSessionList";

export function useCreateSession() {
  const utils = trpc.useUtils();

  return trpc.session.create.useMutation({
    onMutate({ sessionId }) {
      presetMessageCache(utils, sessionId);
    },
    onSuccess(newSession) {
      trackEvent("session.create", newSession.id);
      prependSessionCache(utils, newSession);
    },
    onError(_error, { sessionId }) {
      clearMessageCache(utils, sessionId);
    },
  });
}

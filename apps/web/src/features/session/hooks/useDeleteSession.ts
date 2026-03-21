import { trackEvent } from "@web/lib/posthog";
import { trpc } from "@web/lib/trpc";

import { removeSessionCache } from "./useSessionList";

export function useDeleteSession() {
  const utils = trpc.useUtils();

  return trpc.session.delete.useMutation({
    onSuccess(_, { sessionId }) {
      trackEvent("session.delete", sessionId);
      removeSessionCache(utils, sessionId);
    },
  });
}

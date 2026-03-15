import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { trpc } from "@web/lib/trpc";

import { updateSessionCache, updateSessionTitleCache } from "./useSessionList";

export function useUpdateSession() {
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();

  return trpc.session.update.useMutation({
    onMutate({ sessionId, title }) {
      const listInput = { limit: SESSION_LIST_LIMIT };
      const prevPages = utils.session.list.getInfiniteData(listInput);
      updateSessionTitleCache(utils, sessionId, title);
      return { prevPages };
    },
    onSuccess(updatedSession) {
      trackEvent("session.update", updatedSession.id);
      updateSessionCache(utils, updatedSession);
    },
    onError(_err, _vars, context) {
      if (context?.prevPages) {
        utils.session.list.setInfiniteData(
          { limit: SESSION_LIST_LIMIT },
          context.prevPages,
        );
      }
    },
  });
}

import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { trackEvent } from "@web/lib/posthog/trackEvent";
import { trpc } from "@web/lib/trpc";

import { updateSessionCache, updateSessionTitleCache } from "./useSessionList";

export function useUpdateSession() {
  const utils = trpc.useUtils();

  return trpc.session.update.useMutation({
    async onMutate({ sessionId, title }) {
      await utils.session.list.cancel({ limit: SESSION_LIST_LIMIT });
      const listInput = { limit: SESSION_LIST_LIMIT };
      const prevPages = utils.session.list.getInfiniteData(listInput);
      updateSessionTitleCache(utils, sessionId, title);
      return { prevPages };
    },
    onSuccess(updatedSession) {
      trackEvent("session.update", updatedSession.id);
      updateSessionCache(utils, updatedSession);
    },
    onError(_error, _vars, context) {
      if (context?.prevPages) {
        utils.session.list.setInfiniteData(
          { limit: SESSION_LIST_LIMIT },
          context.prevPages,
        );
      }
    },
    onSettled() {
      utils.session.list.invalidate({ limit: SESSION_LIST_LIMIT });
    },
  });
}

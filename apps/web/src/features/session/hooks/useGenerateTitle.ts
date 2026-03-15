import { trpc } from "@web/lib/trpc";

import { updateSessionTitleCache } from "./useSessionList";

export function useGenerateTitle() {
  const utils = trpc.useUtils();

  return trpc.session.generateTitle.useMutation({
    onSuccess(title, { sessionId }) {
      if (title) {
        updateSessionTitleCache(utils, sessionId, title);
      }
    },
  });
}

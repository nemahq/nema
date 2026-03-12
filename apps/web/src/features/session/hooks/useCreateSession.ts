import { trpc } from "@web/lib/trpc";

import { prependSessionCache } from "./useSessionList";

export function useCreateSession() {
  const utils = trpc.useUtils();

  return trpc.session.create.useMutation({
    onSuccess(newSession) {
      prependSessionCache(utils, newSession);
    },
  });
}

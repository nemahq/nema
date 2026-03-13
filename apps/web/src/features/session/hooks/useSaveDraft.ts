import { trpc } from "@web/lib/trpc";

import { useSessionId } from "./useSessionId";

export function useSaveDraft() {
  const sessionId = useSessionId();
  const utils = trpc.useUtils();

  return trpc.message.saveDraft.useMutation({
    onSuccess(data) {
      utils.session.get.setData({ sessionId }, (old) =>
        old ? { ...old, draft: data.draft } : undefined,
      );
    },
    onSettled() {
      utils.message.list.invalidate({ sessionId });
    },
  });
}

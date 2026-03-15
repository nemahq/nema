import { useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import { trpc } from "@web/lib/trpc";

export function useChatInputDisabled({
  isStreaming,
}: {
  isStreaming: boolean;
}) {
  const saveDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.saveDraft) }) > 0;
  const cancelDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.cancelDraft) }) > 0;

  return isStreaming || saveDraftMutating || cancelDraftMutating;
}

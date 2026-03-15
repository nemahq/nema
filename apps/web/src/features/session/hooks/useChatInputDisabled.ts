import { useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import { trpc } from "@web/lib/trpc";

import type { StreamingPhase } from "./useSendMessage";

export function useChatInputDisabled({
  streamingPhase,
}: {
  streamingPhase: StreamingPhase;
}) {
  const saveDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.saveDraft) }) > 0;
  const cancelDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.cancelDraft) }) > 0;

  return streamingPhase !== "idle" || saveDraftMutating || cancelDraftMutating;
}

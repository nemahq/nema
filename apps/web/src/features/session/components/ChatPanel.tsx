import { useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { SidePanel } from "./SidePanel";

export function ChatPanel({
  onSubmit,
}: {
  onSubmit: (message: string) => void;
}) {
  const { t } = useTranslation();
  const { streamingPhase } = useChatStream();

  const saveDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.saveDraft) }) > 0;
  const cancelDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.cancelDraft) }) > 0;
  const isChatInputDisabled =
    streamingPhase !== "idle" || saveDraftMutating || cancelDraftMutating;

  return (
    <SidePanel>
      <MessageList
        footer={
          <div className="mx-auto w-full max-w-2xl px-6 pb-6 pt-2">
            <ChatInput
              placeholder={t("session.input_placeholder")}
              disabled={isChatInputDisabled}
              onSubmit={onSubmit}
            />
          </div>
        }
      />
    </SidePanel>
  );
}

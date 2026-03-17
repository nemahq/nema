import { useMemo } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useContentTab } from "@web/features/session/contexts/ContentTabContext";
import { useRegisterAction } from "@web/hooks/shortcut/useRegisterAction";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

import type { SlashCommand } from "./ChatInput";
import { ChatInput } from "./ChatInput";

export function ChatComposer() {
  const { t } = useTranslation();
  const { send, cancel, streamingPhase } = useChatStream();
  const { openHelpTab } = useContentTab();

  const saveDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.saveDraft) }) > 0;
  const cancelDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.cancelDraft) }) > 0;
  const isStreaming = streamingPhase !== "idle";

  useRegisterAction("stream.stop", {
    execute: cancel,
    enabled: isStreaming,
  });

  const slashCommands = useMemo<SlashCommand[]>(
    () => [
      {
        name: "help",
        descriptionKey: "session.help_description",
        execute: openHelpTab,
      },
    ],
    [openHelpTab],
  );

  return (
    <ChatInput
      placeholder={t("session.input_placeholder")}
      onSubmit={send}
      onStop={isStreaming ? cancel : undefined}
      submitDisabled={saveDraftMutating || cancelDraftMutating}
      autoFocus
      slashCommands={slashCommands}
    />
  );
}

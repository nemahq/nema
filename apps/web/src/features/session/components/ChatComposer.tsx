import { useMemo, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import { ChatInput } from "@web/components/ui/ChatInput";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { SlashCommandMenu } from "@web/lib/command/SlashCommandMenu";
import type { SlashCommand } from "@web/lib/command/types";
import { useSlashCommandMenu } from "@web/lib/command/useSlashCommandMenu";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

import { useChatStream } from "../contexts/ChatStreamContext";
import { useContentTab } from "../contexts/ContentTabContext";

export function ChatComposer() {
  const { t } = useTranslation();
  const { send, cancel, streamingPhase } = useChatStream();
  const { openHelpTab } = useContentTab();
  const [value, setValue] = useState("");

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

  const {
    showMenu,
    filteredCommands,
    selectedIndex,
    selectCommand,
    handleMenuKeyDown,
    handleValueChange,
  } = useSlashCommandMenu(slashCommands, value, () => setValue(""));

  function handleChange(newValue: string) {
    setValue(newValue);
    handleValueChange();
  }

  function handleSubmit(content: string) {
    send(content);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const handled = handleMenuKeyDown(e.key, e.nativeEvent.isComposing);
    if (handled) {
      e.preventDefault();
      if (e.key === "Escape") {
        e.stopPropagation();
      }
    }
  }

  return (
    <ChatInput
      value={value}
      onChange={handleChange}
      placeholder={t("session.input_placeholder")}
      onSubmit={handleSubmit}
      onStop={isStreaming ? cancel : undefined}
      submitDisabled={saveDraftMutating || cancelDraftMutating}
      autoFocus
      onKeyDown={handleKeyDown}
      menuSlot={
        showMenu ? (
          <SlashCommandMenu
            commands={filteredCommands}
            selectedIndex={selectedIndex}
            onSelect={selectCommand}
          />
        ) : undefined
      }
    />
  );
}

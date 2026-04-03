import { useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import {
  CHAT_COMPOSER_SELECTOR,
  ChatInput,
} from "@web/components/ui/ChatInput";
import { MODE_CONFIG } from "@web/features/session/chatModeConfig";
import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useContentTab } from "@web/features/session/contexts/ContentTabContext";
import { useChatDraft } from "@web/features/session/hooks/useChatDraft";
import { useChatMode } from "@web/features/session/hooks/useChatMode";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import {
  getAllCommandIds,
  getCommandDef,
} from "@web/lib/command/slash/commandMap";
import { SlashCommandMenu } from "@web/lib/command/slash/SlashCommandMenu";
import type { SlashCommand } from "@web/lib/command/slash/types";
import { useSlashCommandMenu } from "@web/lib/command/slash/useSlashCommandMenu";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

export function ChatComposer() {
  const { t } = useTranslation();
  const { send, cancel, streamingPhase, pendingConfirmation } =
    useChatLifecycle();
  const { openTab } = useContentTab();
  const sessionId = useSessionId();
  const [inputValue, setInputValue] = useChatDraft(sessionId);
  const { mode, toggleMode } = useChatMode();

  const saveDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.saveJob.enqueue) }) > 0;
  const cancelDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.cancelDraft) }) > 0;
  const isStreaming = streamingPhase !== "idle";

  useRegisterAction("stream.stop", {
    execute: cancel,
    enabled: isStreaming,
  });

  useRegisterAction("navigation.focusComposer", {
    execute: () => {
      const el = document.querySelector<HTMLTextAreaElement>(
        CHAT_COMPOSER_SELECTOR,
      );
      el?.focus();
    },
  });

  const executors: Record<string, () => void> = {
    help: () => openTab("help"),
  };

  const slashCommands: SlashCommand[] = getAllCommandIds().map((id) => ({
    name: id,
    descriptionKey: getCommandDef(id).descriptionKey,
    execute: executors[id],
  }));

  const {
    showMenu,
    filteredCommands,
    selectedIndex,
    selectCommand,
    handleMenuKeyDown,
    handleValueChange,
  } = useSlashCommandMenu(slashCommands, inputValue, () => setInputValue(""));

  function handleChange(newValue: string) {
    setInputValue(newValue);
    handleValueChange();
  }

  function handleSubmit(content: string) {
    send(content, mode);
    setInputValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      toggleMode();
      return;
    }

    const handled = handleMenuKeyDown(e.key, e.nativeEvent.isComposing);
    if (handled) {
      e.preventDefault();
      if (e.key === "Escape") {
        e.stopPropagation();
      }
    }
  }

  return (
    <div className="relative">
      {showMenu && (
        <SlashCommandMenu
          commands={filteredCommands}
          selectedIndex={selectedIndex}
          onSelect={selectCommand}
        />
      )}
      <p className="px-2 pb-1 text-xs text-fg-tertiary">
        <span className={`font-semibold ${MODE_CONFIG[mode].color}`}>
          {t(MODE_CONFIG[mode].labelKey)}
        </span>{" "}
        {t("session.mode_hint_shortcut")}
      </p>
      <ChatInput
        value={inputValue}
        onChange={handleChange}
        placeholder={t(MODE_CONFIG[mode].placeholderKey)}
        onSubmit={handleSubmit}
        onStop={isStreaming ? cancel : undefined}
        submitDisabled={
          saveDraftMutating || cancelDraftMutating || !!pendingConfirmation
        }
        disabled={!!pendingConfirmation}
        autoFocus
        onKeyDown={handleKeyDown}
        submitIcon={MODE_CONFIG[mode].icon}
      />
    </div>
  );
}

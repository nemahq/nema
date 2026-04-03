import { type KeyboardEvent, useState } from "react";

import { ChatInput } from "@web/components/ui/ChatInput";
import { MODE_CONFIG } from "@web/features/session/chatModeConfig";
import { Greeting } from "@web/features/session/components/Greeting";
import { useChatMode } from "@web/features/session/hooks/useChatMode";
import { useStartSession } from "@web/features/session/hooks/useStartSession";
import { useTranslation } from "@web/lib/tolgee";

export function HomePage() {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const { mode, toggleMode } = useChatMode();
  const { startSession, isPending } = useStartSession();

  function handleSubmit(content: string) {
    startSession(content, mode);
    setInputValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      toggleMode();
    }
  }

  const { placeholderKey, labelKey, color, icon } = MODE_CONFIG[mode];

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
        <Greeting />
        <div className="w-full">
          <p className="px-2 pb-1 text-xs text-fg-tertiary">
            <span className={`font-semibold ${color}`}>{t(labelKey)}</span>{" "}
            {t("session.mode_hint_shortcut")}
          </p>
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            placeholder={t(placeholderKey)}
            submitDisabled={isPending}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            submitIcon={icon}
            autoFocus
          />
        </div>
      </div>
    </main>
  );
}

import { type KeyboardEvent, useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import type { ChatMode } from "@nema-io/shared";

import {
  HOME_TO_SESSION_INITIAL_MESSAGE_KEY,
  HOME_TO_SESSION_INITIAL_MODE_KEY,
} from "@web/app/constants/routeState";
import { ChatInput } from "@web/components/ui/ChatInput";
import { MODE_CONFIG, nextMode } from "@web/features/session/chatModeConfig";
import { Greeting } from "@web/features/session/components/Greeting";
import { useCreateSession } from "@web/features/session/hooks/useCreateSession";
import { useTranslation } from "@web/lib/tolgee";

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState("");
  const [mode, setMode] = useState<ChatMode>("remember");
  const createSession = useCreateSession();

  const toggleMode = useCallback(() => {
    setMode(nextMode);
  }, []);

  function handleSubmit(content: string) {
    const sessionId = crypto.randomUUID();

    createSession.mutate(
      { sessionId },
      {
        onError: () => {
          navigate({ to: "/", replace: true });
        },
      },
    );

    navigate({
      to: "/session/$sessionId",
      params: { sessionId },
      state: (prev) => ({
        ...prev,
        [HOME_TO_SESSION_INITIAL_MESSAGE_KEY]: content,
        [HOME_TO_SESSION_INITIAL_MODE_KEY]: mode,
      }),
    });

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
            <span className={color}>{t(labelKey)}</span>{" "}
            {t("session.mode_hint_shortcut")}
          </p>
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            placeholder={t(placeholderKey)}
            submitDisabled={createSession.isPending}
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

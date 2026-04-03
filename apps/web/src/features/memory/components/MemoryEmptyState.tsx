import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  HOME_TO_SESSION_INITIAL_MESSAGE_KEY,
  HOME_TO_SESSION_INITIAL_MODE_KEY,
} from "@web/app/constants/routeState";
import { ChatInput } from "@web/components/ui/ChatInput";
import { MODE_CONFIG, useCreateSession } from "@web/features/session";
import { useTranslation } from "@web/lib/tolgee";

const REMEMBER_MODE = MODE_CONFIG["remember"];

export function MemoryEmptyState() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState("");
  const createSession = useCreateSession();

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
        [HOME_TO_SESSION_INITIAL_MODE_KEY]: "remember",
      }),
    });

    setInputValue("");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-6">
        <div className="text-center">
          <p className="text-base text-fg-primary">
            {t("memory.empty_heading")}
          </p>
          <p className="mt-1 text-sm text-fg-secondary">
            {t("memory.empty_subheading")}
          </p>
        </div>
        <div className="w-full">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            placeholder={t(REMEMBER_MODE.placeholderKey)}
            submitDisabled={createSession.isPending}
            onSubmit={handleSubmit}
            submitIcon={REMEMBER_MODE.icon}
            autoFocus
          />
        </div>
      </div>
    </main>
  );
}

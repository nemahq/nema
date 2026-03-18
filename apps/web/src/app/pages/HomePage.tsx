import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { ChatInput } from "@web/components/ui/ChatInput";
import { Greeting } from "@web/features/session/components/Greeting";
import { useCreateSession } from "@web/features/session/hooks/useCreateSession";
import { useTranslation } from "@web/lib/tolgee";

export function HomePage() {
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
      }),
    });

    setInputValue("");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
        <Greeting />
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          placeholder={t("session.input_placeholder")}
          submitDisabled={createSession.isPending}
          onSubmit={handleSubmit}
          autoFocus
        />
      </div>
    </main>
  );
}

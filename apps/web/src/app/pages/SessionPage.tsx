import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import type { Message } from "@nema-io/shared";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { Greeting } from "@web/features/session/components/Greeting";
import { MessageList } from "@web/features/session/components/MessageList";
import { useCreateSession } from "@web/features/session/hooks/useCreateSession";
import { MOCK_MESSAGES } from "@web/features/session/mock";
import { useTranslation } from "@web/lib/tolgee";
import en from "@web/lib/tolgee/en.json";

const VARIANT_COUNT = Object.keys(en.session).filter((k) =>
  k.startsWith("empty_heading_"),
).length;

function pickRandom() {
  return Math.floor(Math.random() * VARIANT_COUNT);
}

export function SessionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [variant] = useState(pickRandom);
  const [messages] = useState<Message[]>(MOCK_MESSAGES);

  const hasMessages = messages.length > 0;
  const createSession = useCreateSession();

  function handleSubmit() {
    createSession.mutate(undefined, {
      onSuccess: (session) =>
        navigate({
          to: "/context/$sessionId",
          params: { sessionId: session.id },
        }),
    });
  }

  return (
    <main
      className={`flex flex-1 flex-col bg-surface-card ${hasMessages ? "" : "items-center justify-center"}`}
    >
      {hasMessages ? (
        <>
          <MessageList messages={messages} />
          <div className="mx-auto w-full max-w-2xl px-6 pb-4 pt-2">
            <ChatInput
              placeholder={t("session.input_placeholder")}
              disabled={createSession.isPending}
              onSubmit={handleSubmit}
            />
          </div>
        </>
      ) : (
        <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
          <Greeting variant={variant} />
          <ChatInput
            placeholder={t("session.input_placeholder")}
            disabled={createSession.isPending}
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </main>
  );
}

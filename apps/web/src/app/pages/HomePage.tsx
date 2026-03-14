import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { ChatInput } from "@web/features/session/components/ChatInput";
import { Greeting } from "@web/features/session/components/Greeting";
import { useCreateSession } from "@web/features/session/hooks/useCreateSession";
import { useTranslation } from "@web/lib/tolgee";
import en from "@web/lib/tolgee/en.json";
import { trpc } from "@web/lib/trpc";

const VARIANT_COUNT = Object.keys(en.session).filter((k) =>
  k.startsWith("empty_heading_"),
).length;

function pickRandom() {
  return Math.floor(Math.random() * VARIANT_COUNT);
}

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [variant] = useState(pickRandom);
  const utils = trpc.useUtils();
  const createSession = useCreateSession();

  function handleSubmit(content: string) {
    const sessionId = crypto.randomUUID();

    utils.message.list.setData({ sessionId }, []);
    createSession.mutate({ sessionId });

    navigate({
      to: "/session/$sessionId",
      params: { sessionId },
      state: (prev) => ({
        ...prev,
        [HOME_TO_SESSION_INITIAL_MESSAGE_KEY]: content,
      }),
    });
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
        <Greeting variant={variant} />
        <ChatInput
          placeholder={t("session.input_placeholder")}
          disabled={createSession.isPending}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}

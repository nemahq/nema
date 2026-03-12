import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { Greeting } from "@web/features/session/components/Greeting";
import { useCreateSession } from "@web/features/session/hooks/useCreateSession";
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

  const createSession = useCreateSession();

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
        <Greeting variant={variant} />
        <ChatInput
          placeholder={t("session.input_placeholder")}
          disabled={createSession.isPending}
          onSubmit={() =>
            createSession.mutate(undefined, {
              onSuccess: (session) =>
                navigate({
                  to: "/context/$sessionId",
                  params: { sessionId: session.id },
                }),
            })
          }
        />
      </div>
    </main>
  );
}

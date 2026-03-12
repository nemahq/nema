import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { Greeting } from "@web/features/session/components/Greeting";
import { useTranslation } from "@web/lib/tolgee";
import en from "@web/lib/tolgee/en.json";
import { trpc } from "@web/lib/trpc";

const VARIANT_COUNT = Object.keys(en.session).filter((k) =>
  k.startsWith("empty_heading_"),
).length;

function pickRandom() {
  return Math.floor(Math.random() * VARIANT_COUNT);
}

export function SessionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [variant] = useState(pickRandom);

  const createSession = trpc.session.create.useMutation({
    onSuccess(newSession) {
      utils.session.list.setInfiniteData({ limit: 20 }, (old) => {
        if (!old?.pages[0]) return old;
        const [firstPage, ...rest] = old.pages;
        return {
          ...old,
          pages: [
            { ...firstPage, items: [newSession, ...firstPage.items] },
            ...rest,
          ],
        };
      });
      navigate({
        to: "/context/$sessionId",
        params: { sessionId: newSession.id },
      });
    },
  });

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
        <Greeting variant={variant} />
        <ChatInput
          placeholder={t("session.input_placeholder")}
          disabled={createSession.isPending}
          onSubmit={() => createSession.mutate()}
        />
      </div>
    </main>
  );
}

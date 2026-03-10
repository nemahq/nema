import { useState } from "react";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { Greeting } from "@web/features/session/components/Greeting";
import { SessionSidebar } from "@web/features/session/components/SessionSidebar";
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
  const [variant] = useState(pickRandom);

  return (
    <>
      <SessionSidebar />

      <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
          <Greeting variant={variant} />
          <ChatInput
            placeholder={t("session.input_placeholder")}
            onSubmit={() => {
              // TODO: tRPC message.chat mutation 호출 — 서버 API 구현 완료 (message-router.ts)
            }}
          />
        </div>
      </main>
    </>
  );
}

import { useState } from "react";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { EmptyState } from "@web/features/session/components/EmptyState";
import { SessionSidebar } from "@web/features/session/components/SessionSidebar";
import { useTranslation } from "@web/lib/tolgee";

const VARIANT_COUNT = 4;

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
          <EmptyState variant={variant} />
          <ChatInput
            placeholder={t("session.input_placeholder")}
            onSubmit={() => {
              // TODO: 메시지 전송 API 연결
            }}
          />
        </div>
      </main>
    </>
  );
}

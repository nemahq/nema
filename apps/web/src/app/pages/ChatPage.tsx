import { useParams } from "@tanstack/react-router";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { useTranslation } from "@web/lib/tolgee";

export function ChatPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams({
    from: "/_authenticated/_sidebar/context/$sessionId",
  });

  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-fg-tertiary">{sessionId}</p>
      </div>
      <div className="mx-auto w-full max-w-2xl px-6 pb-6">
        <ChatInput
          placeholder={t("session.input_placeholder")}
          onSubmit={() => {
            // TODO: 메시지 전송 API 연결
          }}
        />
      </div>
    </main>
  );
}

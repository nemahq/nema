import { useParams } from "@tanstack/react-router";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { MessageList } from "@web/features/session/components/MessageList";
import { useMessageList } from "@web/features/session/hooks/useMessageList";
import { useSendMessage } from "@web/features/session/hooks/useSendMessage";
import { useTranslation } from "@web/lib/tolgee";

export function ChatPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams({
    from: "/_authenticated/_sidebar/context/$sessionId",
  });

  const messages = useMessageList({ sessionId });
  const sendMessage = useSendMessage({ sessionId });

  function handleSubmit(content: string) {
    sendMessage.mutate({ sessionId, content });
  }

  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <MessageList messages={messages} />
      <div className="mx-auto w-full max-w-2xl px-6 pb-6 pt-2">
        <ChatInput
          placeholder={t("session.input_placeholder")}
          disabled={sendMessage.isPending}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}

import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";

import type { Message } from "@nema-io/shared";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { MessageList } from "@web/features/session/components/MessageList";
import { useMessageList } from "@web/features/session/hooks/useMessageList";
import { useSendMessage } from "@web/features/session/hooks/useSendMessage";
import { useTranslation } from "@web/lib/tolgee";

const STREAMING_MESSAGE_ID = "streaming";

export function ChatPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams({
    from: "/_authenticated/_sidebar/context/$sessionId",
  });

  const serverMessages = useMessageList({ sessionId });
  const { send, isStreaming, streamingText } = useSendMessage({ sessionId });

  const messages = useMemo(() => {
    if (!isStreaming || !streamingText) {
      return serverMessages;
    }

    const streamingMessage: Message = {
      id: STREAMING_MESSAGE_ID,
      role: "assistant",
      type: "text",
      content: streamingText,
      createdAt: new Date().toISOString(),
    };

    return [...serverMessages, streamingMessage];
  }, [serverMessages, isStreaming, streamingText]);

  function handleSubmit(content: string) {
    send(content);
  }

  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <MessageList messages={messages} />
      <div className="mx-auto w-full max-w-2xl px-6 pb-6 pt-2">
        <ChatInput
          placeholder={t("session.input_placeholder")}
          disabled={isStreaming}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}

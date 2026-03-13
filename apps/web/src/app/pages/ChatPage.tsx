import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { MessageList } from "@web/features/session/components/MessageList";
import { MessageListSkeleton } from "@web/features/session/components/MessageListSkeleton";
import { useMessageList } from "@web/features/session/hooks/useMessageList";
import { useSendMessage } from "@web/features/session/hooks/useSendMessage";
import { useTranslation } from "@web/lib/tolgee";

function SuspendedMessageList({ sessionId }: { sessionId: string }) {
  const messages = useMessageList({ sessionId });
  return <MessageList messages={messages} />;
}

export function ChatPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams({
    from: "/_authenticated/_sidebar/context/$sessionId",
  });

  const sendMessage = useSendMessage({ sessionId });

  function handleSubmit(content: string) {
    sendMessage.mutate({ sessionId, content });
  }

  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <Suspense fallback={<MessageListSkeleton />}>
        <SuspendedMessageList sessionId={sessionId} />
      </Suspense>
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

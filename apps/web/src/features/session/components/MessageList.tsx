import { Suspense, useMemo } from "react";

import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useMessageList } from "@web/features/session/hooks/useMessageList";
import { useSessionId } from "@web/features/session/hooks/useSessionId";

import { AssistantMessage } from "./AssistantMessage";
import { StatusMessage } from "./StatusMessage";
import { UserMessage } from "./UserMessage";

function MessageListContent() {
  const sessionId = useSessionId();
  const { streamingMessage } = useChatStream();
  const serverMessages = useMessageList({ sessionId });
  const messages = useMemo(
    () =>
      streamingMessage ? [...serverMessages, streamingMessage] : serverMessages,
    [serverMessages, streamingMessage],
  );

  return (
    <>
      {messages.map((msg) => {
        if (msg.type === "draft") {
          return null;
        }
        if (msg.role === "user") {
          return <UserMessage key={msg.id} content={msg.content} />;
        }
        if (msg.type === "status") {
          return <StatusMessage key={msg.id} message={msg} />;
        }
        return (
          <AssistantMessage
            key={msg.id}
            content={msg.content}
            createdAt={msg.createdAt}
          />
        );
      })}
    </>
  );
}

export function MessageList() {
  return (
    <Suspense>
      <MessageListContent />
    </Suspense>
  );
}

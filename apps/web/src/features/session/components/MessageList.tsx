import type { DisplayMessage } from "@web/features/session/contexts/ChatStreamContext";

import { AssistantMessage } from "./AssistantMessage";
import { StatusMessage } from "./StatusMessage";
import { UserMessage } from "./UserMessage";

interface MessageListProps {
  messages: DisplayMessage[];
}

export function MessageList({ messages }: MessageListProps) {
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

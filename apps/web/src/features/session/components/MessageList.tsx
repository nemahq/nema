import { Suspense } from "react";

import { useSessionMessages } from "@web/features/session/hooks/useSessionMessages";

import { AssistantMessage } from "./AssistantMessage";
import { StatusMessage } from "./StatusMessage";
import { UserMessage } from "./UserMessage";

function MessageListContent() {
  const messages = useSessionMessages();

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

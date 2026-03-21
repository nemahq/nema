import { Suspense } from "react";

import type { DisplayMessage } from "@web/features/session/contexts/ChatStreamContext";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { USER_TURN_DATA_ROLE } from "@web/features/session/hooks/useScrollAnchor";
import { useSessionMessages } from "@web/features/session/hooks/useSessionMessages";

import { AssistantMessage } from "./AssistantMessage";
import { StatusMessage } from "./StatusMessage";
import { StreamErrorMessage } from "./StreamErrorMessage";
import { UserMessage } from "./UserMessage";

function groupIntoTurns(messages: DisplayMessage[]): DisplayMessage[][] {
  const turns: DisplayMessage[][] = [];
  let currentTurn: DisplayMessage[] = [];

  for (const msg of messages) {
    if (msg.type === "draft") {
      continue;
    }
    if (msg.role === "user" && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [];
    }
    currentTurn.push(msg);
  }
  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }
  return turns;
}

function MessageListContent() {
  const messages = useSessionMessages();
  const turns = groupIntoTurns(messages);
  const { streamError, streamingPhase, retryStream, dismissStreamError } =
    useChatStream();

  const showChatError = streamError && streamingPhase === "text";

  return (
    <>
      {turns.map((turn, index) => {
        const isLastTurn = index === turns.length - 1;

        return (
          <div
            key={turn[0].id}
            data-role={
              turn[0].role === "user" ? USER_TURN_DATA_ROLE : undefined
            }
            className="mx-auto w-full max-w-2xl space-y-4 px-6 pt-6"
            style={
              isLastTurn ? { minHeight: "var(--panel-height)" } : undefined
            }
          >
            {turn.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div
                    key={msg.id}
                    className="sticky top-0 z-[5] bg-surface-base py-1"
                  >
                    <UserMessage content={msg.content} />
                  </div>
                );
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
            {isLastTurn && showChatError && (
              <StreamErrorMessage
                message={streamError}
                onRetry={retryStream}
                onDismiss={dismissStreamError}
              />
            )}
          </div>
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

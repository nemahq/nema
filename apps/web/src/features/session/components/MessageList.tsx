import { Suspense, useMemo } from "react";

import { Button } from "@nema-io/weave";
import { ChevronDown } from "@nema-io/weave/icons";

import { useAutoScroll } from "@web/features/session/hooks/useAutoScroll";
import { useMessageList } from "@web/features/session/hooks/useMessageList";
import { useTranslation } from "@web/lib/tolgee";

import { AssistantMessage } from "./AssistantMessage";
import { DraftCard } from "./DraftCard";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { UserMessage } from "./UserMessage";

interface MessageListProps {
  sessionId: string;
  streamingMessage?: Message;
}

function MessageListContent({ sessionId, streamingMessage }: MessageListProps) {
  const { t } = useTranslation();
  const serverMessages = useMessageList({ sessionId });
  const messages = streamingMessage
    ? [...serverMessages, streamingMessage]
    : serverMessages;
  const { scrollRef, showNewMessageButton, scrollToBottom } = useAutoScroll({
    messages,
  });

  const lastDraftIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === "draft") {
        return i;
      }
    }
    return -1;
  }, [messages]);

  return (
    <div className="relative flex-1">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
      >
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return <UserMessage key={msg.id} message={msg} />;
            }
            if (msg.type === "draft") {
              return (
                <DraftCard
                  key={msg.id}
                  message={msg}
                  isLatest={i === lastDraftIndex}
                />
              );
            }
            return <AssistantMessage key={msg.id} message={msg} />;
          })}
        </div>
      </div>

      {showNewMessageButton && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <Button
            variant="neutral"
            size="sm"
            onClick={() => scrollToBottom("smooth")}
            className="shadow-md"
          >
            <ChevronDown className="size-4" />
            {t("session.new_messages")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function MessageList({ sessionId, streamingMessage }: MessageListProps) {
  return (
    <Suspense fallback={<MessageListSkeleton />}>
      <MessageListContent
        sessionId={sessionId}
        streamingMessage={streamingMessage}
      />
    </Suspense>
  );
}

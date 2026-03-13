import { Suspense, useMemo } from "react";

import type { Message } from "@nema-io/shared";
import { Button } from "@nema-io/weave";
import { ChevronDown } from "@nema-io/weave/icons";

import { useAutoScroll } from "@web/features/session/hooks/useAutoScroll";
import { useMessageList } from "@web/features/session/hooks/useMessageList";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useTranslation } from "@web/lib/tolgee";

import { AssistantMessage } from "./AssistantMessage";
import { DraftCard } from "./DraftCard";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { UserMessage } from "./UserMessage";

interface MessageListProps {
  streamingMessage?: Message;
}

function MessageListContent({ streamingMessage }: MessageListProps) {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const serverMessages = useMessageList({ sessionId });
  const messages = useMemo(
    () =>
      streamingMessage ? [...serverMessages, streamingMessage] : serverMessages,
    [serverMessages, streamingMessage],
  );
  const { scrollRef, showNewMessageButton, scrollToBottom } = useAutoScroll({
    messages,
  });

  const lastDraftIndex = useMemo(
    () => messages.findLastIndex((msg) => msg.type === "draft"),
    [messages],
  );

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

export function MessageList({ streamingMessage }: MessageListProps) {
  return (
    <Suspense fallback={<MessageListSkeleton />}>
      <MessageListContent streamingMessage={streamingMessage} />
    </Suspense>
  );
}

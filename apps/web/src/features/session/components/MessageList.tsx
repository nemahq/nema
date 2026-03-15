import type { ReactNode } from "react";
import { Suspense, useMemo } from "react";

import { Button } from "@nema-io/weave";
import { ChevronDown } from "@nema-io/weave/icons";

import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useAutoScroll } from "@web/features/session/hooks/useAutoScroll";
import { useMessageList } from "@web/features/session/hooks/useMessageList";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useTranslation } from "@web/lib/tolgee";

import { AssistantMessage } from "./AssistantMessage";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { StatusMessage } from "./StatusMessage";
import { UserMessage } from "./UserMessage";

function MessageListContent({ footer }: { footer?: ReactNode }) {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const { streamingMessage } = useChatStream();
  const serverMessages = useMessageList({ sessionId });
  const messages = useMemo(
    () =>
      streamingMessage ? [...serverMessages, streamingMessage] : serverMessages,
    [serverMessages, streamingMessage],
  );
  const { scrollRef, showNewMessageButton, scrollToBottom } = useAutoScroll({
    messages,
  });

  return (
    <div className="relative flex-1">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
      >
        <div className="flex min-h-full flex-col">
          <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-6">
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
          </div>

          {footer && (
            <div className="sticky bottom-0 bg-surface-base">{footer}</div>
          )}
        </div>
      </div>

      {showNewMessageButton && (
        <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2">
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

export function MessageList({ footer }: { footer?: ReactNode }) {
  return (
    <Suspense fallback={<MessageListSkeleton />}>
      <MessageListContent footer={footer} />
    </Suspense>
  );
}

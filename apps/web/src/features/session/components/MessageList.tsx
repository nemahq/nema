import type { Message } from "@nema-io/shared";
import { Button } from "@nema-io/weave";
import { ChevronDown } from "@nema-io/weave/icons";

import { useAutoScroll } from "@web/features/session/hooks/useAutoScroll";
import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageBubble } from "./MessageBubble";
import { RelativeTime } from "./RelativeTime";

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] md:max-w-[70%]">
        <MessageBubble className="rounded-br-sm">
          <p className="text-[15px] leading-[1.7] text-fg-primary whitespace-pre-wrap">
            {message.content}
          </p>
        </MessageBubble>
        <div className="mt-1 pr-1 text-right">
          <RelativeTime dateTime={message.createdAt} />
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  return (
    <div>
      <MarkdownRenderer content={message.content} />
      <div className="mt-1">
        <RelativeTime dateTime={message.createdAt} />
      </div>
    </div>
  );
}

export function MessageList({ messages }: { messages: Message[] }) {
  const { t } = useTranslation();
  const { scrollRef, showNewMessageButton, scrollToBottom } = useAutoScroll({
    messages,
  });

  return (
    <div className="relative flex-1">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
      >
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
          {messages.map((msg) =>
            msg.role === "user" ? (
              <UserMessage key={msg.id} message={msg} />
            ) : (
              <AssistantMessage key={msg.id} message={msg} />
            ),
          )}
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

import type { Message } from "@nema-io/shared";
import { Button } from "@nema-io/weave";
import { ChevronDown } from "@nema-io/weave/icons";

import { useAutoScroll } from "@web/features/session/hooks/useAutoScroll";
import { useTranslation } from "@web/lib/tolgee";

import { AssistantMessage } from "./AssistantMessage";
import { UserMessage } from "./UserMessage";

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

import type { Message } from "@nema-io/shared";

import { MessageBubble } from "./MessageBubble";
import { RelativeTime } from "./RelativeTime";

export function UserMessage({ message }: { message: Message }) {
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

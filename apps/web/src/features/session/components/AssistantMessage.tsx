import type { Message } from "@nema-io/shared";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { RelativeTime } from "./RelativeTime";

export function AssistantMessage({ message }: { message: Message }) {
  return (
    <div>
      <MarkdownRenderer content={message.content} />
      <div className="mt-1">
        <RelativeTime dateTime={message.createdAt} />
      </div>
    </div>
  );
}

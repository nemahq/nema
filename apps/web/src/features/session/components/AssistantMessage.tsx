import { RelativeTime } from "@web/components/ui/RelativeTime";

import { MarkdownRenderer } from "./MarkdownRenderer";

interface AssistantMessageProps {
  content: string;
  createdAt: string;
}

export function AssistantMessage({
  content,
  createdAt,
}: AssistantMessageProps) {
  return (
    <div>
      <MarkdownRenderer content={content} />
      <div className="mt-1">
        <RelativeTime dateTime={createdAt} />
      </div>
    </div>
  );
}

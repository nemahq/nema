import { MarkdownRenderer } from "./MarkdownRenderer";
import { RelativeTime } from "./RelativeTime";

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

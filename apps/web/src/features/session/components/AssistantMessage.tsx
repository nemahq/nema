import { MarkdownRenderer } from "./MarkdownRenderer";
import { RelativeTime } from "./RelativeTime";

export function AssistantMessage({
  content,
  createdAt,
}: {
  content: string;
  createdAt: string;
}) {
  return (
    <div>
      <MarkdownRenderer content={content} />
      <div className="mt-1">
        <RelativeTime dateTime={createdAt} />
      </div>
    </div>
  );
}

import { MessageBubble } from "./MessageBubble";

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] md:max-w-[70%]">
        <MessageBubble className="rounded-br-sm bg-surface-raised-hover px-3 py-2">
          <p className="text-[15px] leading-[1.7] text-fg-primary whitespace-pre-wrap">
            {content}
          </p>
        </MessageBubble>
      </div>
    </div>
  );
}

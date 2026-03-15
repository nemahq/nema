import type { Message } from "@nema-io/shared";
import { PenLine } from "@nema-io/weave/icons";

export function StatusMessage({ message }: { message: Message }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-fg-tertiary">
      <PenLine className="size-3" />
      <span>{message.content}</span>
    </div>
  );
}

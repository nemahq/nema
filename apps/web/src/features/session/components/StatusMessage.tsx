import type { ReactNode } from "react";

import type { Message } from "@nema-io/shared";

export function StatusMessage({
  message,
  icon,
}: {
  message: Message;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-fg-tertiary">
      {icon}
      <span>{message.content}</span>
    </div>
  );
}

import type { ReactNode } from "react";

import { cn } from "@nema-io/weave";

interface MessageBubbleProps {
  children: ReactNode;
  className?: string;
}

export function MessageBubble({ children, className }: MessageBubbleProps) {
  return (
    <div className={cn("rounded-2xl bg-surface-raised px-4 py-3", className)}>
      {children}
    </div>
  );
}

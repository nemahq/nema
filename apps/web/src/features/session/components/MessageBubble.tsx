import type { ReactNode } from "react";

import { cn } from "@nema-io/weave";

export function MessageBubble({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-surface-raised px-4 py-3", className)}>
      {children}
    </div>
  );
}

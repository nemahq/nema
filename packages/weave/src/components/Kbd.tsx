import type { ComponentProps } from "react";

import { cn } from "../utils";

export function Kbd({ className, children, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded border border-border border-b-[2px] bg-surface-base px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none text-fg-tertiary",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

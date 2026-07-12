import * as React from "react";

import { cn } from "../utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border bg-transparent px-3 py-1 text-base transition-[color,box-shadow] selection:bg-brand selection:text-brand-fg file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg-primary placeholder:text-fg-tertiary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-brand focus-visible:outline-none",
        "aria-invalid:border-status-error aria-invalid:ring-status-error/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

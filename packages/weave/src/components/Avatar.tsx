import * as React from "react";

import { cn } from "../utils";

function Avatar({
  src,
  fallback,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  src?: string;
  fallback: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className={cn("size-7 shrink-0 rounded-full", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-medium text-brand-fg",
        className,
      )}
      {...props}
    >
      {fallback}
    </span>
  );
}

export { Avatar };

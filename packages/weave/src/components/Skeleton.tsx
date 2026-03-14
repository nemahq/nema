import * as React from "react";

import { cn } from "../utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-[length:200%_100%] bg-[linear-gradient(90deg,var(--color-border)_0%,var(--color-surface-raised-hover)_50%,var(--color-border)_100%)] [animation:shimmer_1.5s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };

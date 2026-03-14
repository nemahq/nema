import * as React from "react";

import { cn } from "../utils";

interface AvatarProps extends Omit<React.ComponentProps<"span">, "children"> {
  src?: string;
  fallback: string;
}

function Avatar({ src, fallback, className, ...props }: AvatarProps) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        !src && "bg-brand text-xs font-medium text-brand-fg",
        className,
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full rounded-full"
        />
      ) : (
        fallback
      )}
    </span>
  );
}

export { Avatar };

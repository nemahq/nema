import * as React from "react";

import { cn } from "../utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border bg-transparent px-3 py-1 text-base transition-[color,box-shadow] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg-primary md:text-sm",
        // 비활성 placeholder까지 한 단계 더 죽이지 않으면, 값이 빈 입력창은
        // 활성/비활성이 화면상 전혀 구분되지 않는다(테두리·배경은 그대로라서).
        "placeholder:text-fg-quaternary disabled:cursor-not-allowed disabled:text-fg-quinary disabled:placeholder:text-fg-quinary",
        "focus-visible:border-brand focus-visible:outline-none dark:focus-visible:border-fg-tertiary/70",
        "aria-invalid:border-status-error aria-invalid:ring-status-error/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

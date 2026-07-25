import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";

import { CheckIcon } from "../icons";
import { cn } from "../utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // 16px 정사각형은 짧고 닫힌 윤곽이라 border-strong(weave-usage.md 3단 위계) —
        // border는 목록 구분선처럼 반복·연속되는 자리용이라 이 크기에선 대비가
        // 3:1(UI 요소 최소 기준) 밑으로 떨어진다.
        "peer size-4 shrink-0 rounded-[4px] border border-border-strong transition-shadow disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-status-error aria-invalid:ring-status-error/20 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-fg dark:data-[state=checked]:border-fg-primary dark:data-[state=checked]:bg-fg-primary dark:data-[state=checked]:text-surface-base",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

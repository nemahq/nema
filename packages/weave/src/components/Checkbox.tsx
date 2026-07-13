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
        "peer size-4 shrink-0 rounded-[4px] border border-border transition-shadow disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-status-error aria-invalid:ring-status-error/20 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-fg dark:data-[state=checked]:border-fg-primary dark:data-[state=checked]:bg-fg-primary dark:data-[state=checked]:text-surface-base",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

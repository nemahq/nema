import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../utils";
import { colorClasses, type TextColor } from "./Text";

type LabelProps = React.ComponentProps<typeof LabelPrimitive.Root> & {
  color?: TextColor;
};

function Label({ className, color = "primary", ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none",
        colorClasses[color],
        "peer-disabled:cursor-not-allowed peer-disabled:text-fg-quinary",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

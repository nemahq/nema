import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../utils";
import {
  colorClasses,
  sizeClasses,
  type TextColor,
  type TextSize,
  type TextWeight,
  weightClasses,
} from "./Text";

type LabelProps = React.ComponentProps<typeof LabelPrimitive.Root> & {
  size?: TextSize;
  weight?: TextWeight;
  color?: TextColor;
};

// Textarea와 같은 이유로 Text의 공유 스케일을 그대로 쓴다 — 라벨마다 크기가
// 다른 실사용(CardViewedToggle의 xs 등)이 있어 text-sm 고정이면 소비처가
// className으로 우회해 스케일 밖으로 빠져나간다.
function Label({
  className,
  size = "sm",
  weight = "medium",
  color = "primary",
  ...props
}: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        sizeClasses[size],
        weightClasses[weight],
        colorClasses[color],
        "peer-disabled:cursor-not-allowed peer-disabled:text-fg-quinary",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

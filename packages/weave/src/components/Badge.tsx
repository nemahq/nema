import * as React from "react";

import { cn } from "../utils";

type BadgeVariant =
  | "brand"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral"
  | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  brand: "bg-brand-tint text-brand-accent",
  success: "bg-status-success-tint text-status-success",
  warning: "bg-status-warning-tint text-status-warning",
  error: "bg-status-error-tint text-status-error",
  info: "bg-status-info-tint text-status-info",
  neutral: "bg-surface-raised text-fg-secondary",
  outline: "border border-border text-fg-tertiary",
};

// 원형(pill)은 카운트·이름표처럼 통째로 하나의 값을 담는 자리, 각진 모서리(rounded)는
// 태그·상태처럼 다른 배지와 나란히 여러 개 늘어놓는 자리 — Avatar의 shape 구분과
// 같은 결로, 늘어놓았을 때의 리듬을 shape 하나로 신호한다.
type BadgeShape = "rounded" | "pill";

const SHAPE_CLASSNAME: Record<BadgeShape, string> = {
  rounded: "rounded-[4px]",
  pill: "rounded-full",
};

function Badge({
  variant = "brand",
  shape = "rounded",
  className,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
  shape?: BadgeShape;
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-block px-2 py-0.5 text-[12px] font-medium leading-[1.4]",
        SHAPE_CLASSNAME[shape],
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeShape, type BadgeVariant };

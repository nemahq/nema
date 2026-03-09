import * as React from "react";

import { cn } from "../utils";

type BadgeVariant =
  | "brand"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

const variantClasses: Record<BadgeVariant, string> = {
  brand: "bg-brand-tint text-brand-accent",
  success: "bg-status-success-tint text-status-success",
  warning: "bg-status-warning-tint text-status-warning",
  error: "bg-status-error-tint text-status-error",
  info: "bg-status-info-tint text-status-info",
  neutral: "bg-surface-raised text-fg-secondary",
};

function Badge({
  variant = "brand",
  className,
  ...props
}: React.ComponentPropsWithRef<"span"> & {
  variant?: BadgeVariant;
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-block rounded-[4px] px-2 py-0.5 text-[12px] font-medium leading-[1.4]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeVariant };

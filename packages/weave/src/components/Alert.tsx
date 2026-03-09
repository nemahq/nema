import * as React from "react";

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "../icons";
import { cn } from "../utils";

type AlertVariant = "success" | "warning" | "error" | "info";

const variantClasses: Record<AlertVariant, string> = {
  success: "bg-status-success-tint text-status-success",
  warning: "bg-status-warning-tint text-status-warning",
  error: "bg-status-error-tint text-status-error",
  info: "bg-status-info-tint text-status-info",
};

const variantIcons: Record<AlertVariant, React.ElementType> = {
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  error: OctagonXIcon,
  info: InfoIcon,
};

function Alert({
  variant = "info",
  icon = true,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: AlertVariant;
  icon?: boolean;
}) {
  const Icon = variantIcons[variant];

  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg px-4 py-3 text-[13px] leading-[1.5]",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {icon && <Icon className="mt-0.5 size-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

export { Alert, type AlertVariant };

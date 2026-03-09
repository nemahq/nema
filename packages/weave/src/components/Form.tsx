import * as React from "react";

import { cn } from "../utils";

type FormMessageVariant = "error" | "success";

const formMessageVariantClasses: Record<FormMessageVariant, string> = {
  error: "text-status-error",
  success: "text-status-success",
};

function FormField({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-field"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function FormMessage({
  variant = "error",
  className,
  ...props
}: React.ComponentProps<"p"> & {
  variant?: FormMessageVariant;
}) {
  return (
    <p
      data-slot="form-message"
      role={variant === "error" ? "alert" : undefined}
      className={cn("text-sm", formMessageVariantClasses[variant], className)}
      {...props}
    />
  );
}

export { FormField, FormMessage, type FormMessageVariant };

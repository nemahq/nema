import * as React from "react";

import { cn } from "../utils";

function FormField({
  className,
  ...props
}: React.ComponentPropsWithRef<"div">) {
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
}: React.ComponentPropsWithRef<"p"> & {
  variant?: "error" | "success";
}) {
  return (
    <p
      data-slot="form-message"
      className={cn(
        "text-sm",
        variant === "error" && "text-status-error",
        variant === "success" && "text-status-success",
        className,
      )}
      {...props}
    />
  );
}

export { FormField, FormMessage };

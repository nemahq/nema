import * as React from "react";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "../icons";

function Toast({ theme = "system", ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface-card)",
          "--normal-text": "var(--fg-primary)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--status-success-tint)",
          "--success-text": "var(--status-success)",
          "--success-border": "var(--status-success-tint)",
          "--error-bg": "var(--status-error-tint)",
          "--error-text": "var(--status-error)",
          "--error-border": "var(--status-error-tint)",
          "--warning-bg": "var(--status-warning-tint)",
          "--warning-text": "var(--status-warning)",
          "--warning-border": "var(--status-warning-tint)",
          "--border-radius": "var(--radius-xl)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toast, toast, type ToasterProps };

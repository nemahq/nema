import * as React from "react";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "../icons";

const ICONS = {
  success: <CircleCheckIcon className="size-4" />,
  info: <InfoIcon className="size-4" />,
  warning: <TriangleAlertIcon className="size-4" />,
  error: <OctagonXIcon className="size-4" />,
  loading: <Loader2Icon className="size-4 animate-spin" />,
};

const TOAST_CLASS_NAMES = {
  toast: "!bg-surface-card !text-fg-primary !border-transparent shadow-lg",
  success: "!bg-status-success-tint !text-status-success !border-transparent",
  error: "!bg-status-error-tint !text-status-error !border-transparent",
  warning: "!bg-status-warning-tint !text-status-warning !border-transparent",
};

const TOASTER_STYLE = {
  "--border-radius": "var(--radius-xl)",
} as React.CSSProperties;

function Toast({ theme = "system", ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={ICONS}
      toastOptions={{ classNames: TOAST_CLASS_NAMES }}
      style={TOASTER_STYLE}
      {...props}
    />
  );
}

export { Toast, toast, type ToasterProps };

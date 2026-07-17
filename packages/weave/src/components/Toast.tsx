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
  success: <CircleCheckIcon className="size-4 text-status-success" />,
  info: <InfoIcon className="size-4" />,
  warning: <TriangleAlertIcon className="size-4 text-status-warning" />,
  error: <OctagonXIcon className="size-4 text-status-error" />,
  loading: <Loader2Icon className="size-4 animate-spin" />,
};

// toast.custom()으로 내용을 직접 그리는 소비처는 sonner의 기본 배경(data-styled)을
// 못 받으므로, 같은 톤을 내려면 이 클래스를 그대로 재사용해야 한다.
const TOAST_SURFACE_CLASSNAME =
  "!bg-(--palette-dark-surface-raised-hover) !text-(--palette-dark-fg-primary) !border-transparent shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.5)]";

const TOAST_CLASS_NAMES = {
  toast: TOAST_SURFACE_CLASSNAME,
  cancelButton:
    "!bg-transparent !text-(--palette-dark-fg-tertiary) hover:!text-(--palette-dark-fg-primary) !border-0 !p-0 !ring-0 !ml-auto !text-xs",
};

const TOASTER_STYLE = {
  "--border-radius": "var(--radius-xl)",
} as React.CSSProperties;

function Toast(props: ToasterProps) {
  return (
    <Sonner
      {...props}
      position="top-right"
      theme="dark"
      className="toaster group"
      icons={ICONS}
      toastOptions={{ classNames: TOAST_CLASS_NAMES }}
      style={TOASTER_STYLE}
    />
  );
}

export { Toast, toast, TOAST_SURFACE_CLASSNAME, type ToasterProps };

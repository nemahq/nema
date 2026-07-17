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

// shadow에 !important가 필요하다 — sonner는 CSS를 JS로 <style> 태그를 만들어
// 주입하는데(@layer 밖), Tailwind 유틸리티는 전부 @layer utilities 안에 있어
// 중요도가 같으면 레이어 밖 sonner 규칙이 항상 이긴다(스펙상 명시). !important만
// 레이어 순서를 무시하고 이길 수 있다. bg·text·border는 이미 !important가 있어
// 문제없었지만 shadow만 빠져 있어 sonner 기본 shadow에 지고 있었다.
const TOAST_CLASS_NAMES = {
  toast:
    "!bg-(--palette-dark-surface-raised-hover) !text-(--palette-dark-fg-primary) !border-transparent !shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:!shadow-[0_4px_16px_rgba(0,0,0,0.5)]",
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

export { Toast, toast, type ToasterProps };

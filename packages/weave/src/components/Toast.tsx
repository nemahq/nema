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
// sonner는 cancel을 action보다 먼저 그린다(DOM 순서 고정, props로 못 바꿈) —
// action이 왼쪽에 오게 하려면 flex order로 시각 순서만 뒤집어야 한다. 버튼
// 그룹을 본문에서 떼어놓는 margin-left:auto도 이제 시각적으로 먼저 오는
// actionButton으로 옮겨야 한다(안 옮기면 action·cancel 사이가 벌어짐).
const TOAST_CLASS_NAMES = {
  toast:
    "!bg-(--palette-dark-surface-raised-hover) !text-(--palette-dark-fg-primary) !border-transparent !shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:!shadow-[0_4px_16px_rgba(0,0,0,0.5)]",
  actionButton: "order-1 !ml-auto",
  cancelButton:
    "!bg-transparent !text-(--palette-dark-fg-tertiary) hover:!text-(--palette-dark-fg-primary) !border-0 !p-0 !ring-0 !text-xs order-2",
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

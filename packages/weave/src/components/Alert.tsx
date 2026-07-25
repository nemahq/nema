import * as React from "react";

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "../icons";
import { cn } from "../utils";

type AlertVariant = "success" | "warning" | "error" | "info";

// Badge가 이미 "틴트 배경 + 같은 색 텍스트"를 자기 시각 언어로 쓰고 있어서,
// Alert까지 텍스트를 색칠하면 둘이 구분이 안 된다 — Alert는 배경·아이콘 색으로만
// 심각도를 신호하고, 본문 텍스트는 fg-primary로 중립을 유지한다.
const BACKGROUND_CLASSNAME: Record<AlertVariant, string> = {
  success: "bg-status-success-tint",
  warning: "bg-status-warning-tint",
  error: "bg-status-error-tint",
  info: "bg-status-info-tint",
};

const ICON_COLOR_CLASSNAME: Record<AlertVariant, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  error: "text-status-error",
  info: "text-status-info",
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
        "flex items-start gap-3 rounded-lg px-4 py-3 text-[13px] leading-[1.5] text-fg-primary",
        BACKGROUND_CLASSNAME[variant],
        className,
      )}
      {...props}
    >
      {icon && (
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            ICON_COLOR_CLASSNAME[variant],
          )}
        />
      )}
      <div>{children}</div>
    </div>
  );
}

export { Alert, type AlertVariant };

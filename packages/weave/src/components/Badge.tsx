import * as React from "react";

import { cn } from "../utils";

type BadgeVariant =
  | "brand"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral"
  | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  brand: "bg-brand-tint text-brand-accent",
  success: "bg-status-success-tint text-status-success",
  warning: "bg-status-warning-tint text-status-warning",
  error: "bg-status-error-tint text-status-error",
  info: "bg-status-info-tint text-status-info",
  neutral: "bg-surface-raised text-fg-secondary",
  outline: "border border-border text-fg-tertiary",
};

// 원형(pill)은 카운트·이름표처럼 통째로 하나의 값을 담는 자리, 각진 모서리(rounded)는
// 태그·상태처럼 다른 배지와 나란히 여러 개 늘어놓는 자리 — Avatar의 shape 구분과
// 같은 결로, 늘어놓았을 때의 리듬을 shape 하나로 신호한다.
type BadgeShape = "rounded" | "pill";

const SHAPE_CLASSNAME: Record<BadgeShape, string> = {
  rounded: "rounded-[4px]",
  pill: "rounded-full",
};

// sm은 제목·라벨 옆에 곁들이는 보조 표시용 — 주인공 텍스트보다 한 단계 낮은
// 무게로 읽혀야 하는 자리(예: changeset 타입 라벨)에서 쓴다.
type BadgeSize = "default" | "sm";

const SIZE_CLASSNAME: Record<BadgeSize, string> = {
  default: "px-2 text-[12px]",
  sm: "px-1.5 text-[10px]",
};

function Badge({
  variant = "brand",
  shape = "rounded",
  size = "default",
  className,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
  shape?: BadgeShape;
  size?: BadgeSize;
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-block py-0.5 font-medium leading-[1.4]",
        SIZE_CLASSNAME[size],
        SHAPE_CLASSNAME[shape],
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeShape, type BadgeSize, type BadgeVariant };

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

// Chip과 공유 — surface-raised는 다크 모드에서 surface-card와 완전히 같은 값이
// 돼(tokens/index.css) 카드 배경 위에서 안 보이므로, surface 토큰 대신 배경에
// 상대적으로 대비가 생기는 fg 알파 틴트를 쓴다.
export const NEUTRAL_TONE_CLASSNAME = "bg-fg-primary/10 text-fg-secondary";

const variantClasses: Record<BadgeVariant, string> = {
  brand: "bg-brand-tint text-brand-accent",
  success: "bg-status-success-tint text-status-success",
  warning: "bg-status-warning-tint text-status-warning",
  error: "bg-status-error-tint text-status-error",
  info: "bg-status-info-tint text-status-info",
  neutral: NEUTRAL_TONE_CLASSNAME,
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
  truncated = false,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
  shape?: BadgeShape;
  size?: BadgeSize;
  // min-w-0 없이 truncate만 있으면 flex 안에서 조용히 안 먹으므로 항상 같이 묶는다.
  truncated?: boolean;
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-block py-0.5 font-medium leading-[1.4]",
        SIZE_CLASSNAME[size],
        SHAPE_CLASSNAME[shape],
        variantClasses[variant],
        truncated && "min-w-0 truncate",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeShape, type BadgeSize, type BadgeVariant };

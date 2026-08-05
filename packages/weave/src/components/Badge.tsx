import * as React from "react";

import { cn } from "../utils";

// variant는 "이게 무슨 뜻인가"를 고르는 축이다 — 색은 weave가 정하므로, 성공 색이
// 바뀌어도 소비처는 그대로다.
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

// Chip과 공유 — 틴트 배경이 없는 만큼 테두리·글자 둘 다 강하게 존재감을 만든다.
// 한쪽만 진하게 두면(예: Badge는 글자만, Chip은 테두리만) 같은 outline인데
// 컴포넌트마다 톤이 갈려서, Topic처럼 정적 미리보기(Badge)와 실제 칩(Chip)이
// 나란히 보이는 자리에서 미묘하게 달라 보이는 문제가 있었다.
export const OUTLINE_TONE_CLASSNAME =
  "border border-border-strong text-fg-primary";

const variantClasses: Record<BadgeVariant, string> = {
  brand: "bg-brand-tint text-brand-accent",
  success: "bg-status-success-tint text-status-success",
  warning: "bg-status-warning-tint text-status-warning",
  error: "bg-status-error-tint text-status-error",
  info: "bg-status-info-tint text-status-info",
  neutral: NEUTRAL_TONE_CLASSNAME,
  outline: OUTLINE_TONE_CLASSNAME,
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
// 무게로 읽혀야 하는 자리에서 쓴다.
type BadgeSize = "default" | "sm";

const SIZE_CLASSNAME: Record<BadgeSize, string> = {
  default: "px-2 text-[12px]",
  sm: "px-1.5 text-[10px]",
};

type BadgeProps = React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
  shape?: BadgeShape;
  size?: BadgeSize;
  // min-w-0 없이 truncate만 있으면 flex 안에서 조용히 안 먹으므로 항상 같이 묶는다.
  truncated?: boolean;
};

function Badge({
  variant,
  shape = "rounded",
  size = "default",
  truncated = false,
  className,
  ...props
}: BadgeProps) {
  const tone = variantClasses[variant ?? "brand"];

  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-block py-0.5 font-medium leading-[1.4]",
        SIZE_CLASSNAME[size],
        SHAPE_CLASSNAME[shape],
        tone,
        truncated && "min-w-0 truncate",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeShape, type BadgeSize, type BadgeVariant };

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
export const NEUTRAL_TONE_CLASSNAME = "bg-fg-primary/10 text-fg-primary";

// Chip과 공유 — 틴트 배경이 없는 만큼 테두리·글자 둘 다 강하게 존재감을 만든다.
// 한쪽만 진하게 두면(예: Badge는 글자만, Chip은 테두리만) 같은 outline인데
// 컴포넌트마다 톤이 갈려서, Topic처럼 정적 미리보기(Badge)와 실제 칩(Chip)이
// 나란히 보이는 자리에서 미묘하게 달라 보이는 문제가 있었다. border 대신
// ring-inset을 쓴다 — auto-width 요소에서 border는 박스 바깥으로 두께만큼
// 더해져 다른(테두리 없는) variant보다 실제로 더 커 보인다.
export const OUTLINE_TONE_CLASSNAME =
  "ring-1 ring-inset ring-border-strong text-fg-primary";

const variantClasses: Record<BadgeVariant, string> = {
  brand: "bg-brand-tint text-brand-accent",
  success: "bg-status-success-tint text-status-success",
  warning: "bg-status-warning-tint text-status-warning",
  error: "bg-status-error-tint text-status-error",
  info: "bg-status-info-tint text-status-info",
  neutral: NEUTRAL_TONE_CLASSNAME,
  outline: OUTLINE_TONE_CLASSNAME,
};

// `outline` prop(기본 true)으로 각 variant 자기 색의 인셋 아웃라인을 얹는다 —
// 배경이 opacity 없는 불투명 색이라(tokens/index.css) 기본으로 켜서 경계를
// 분명히 한다. className으로 배경을 완전히 덮어쓰는 자리(Tag 파스텔 칩 등)는
// variant 색 기준 ring이 안 어울리니 소비처에서 명시적으로 false를 준다.
// "outline" variant(별도 톤, 항상 테두리만 있음)와는 별개 축이라 그쪽엔
// 안 얹는다 — 이미 자기 테두리가 있어 중복이라서. border 대신 ring을 쓰는
// 이유는 위 OUTLINE_TONE_CLASSNAME 주석 참고.
const RING_CLASSNAME: Record<Exclude<BadgeVariant, "outline">, string> = {
  brand: "ring-1 ring-inset ring-brand/25",
  success: "ring-1 ring-inset ring-status-success/25",
  warning: "ring-1 ring-inset ring-status-warning/25",
  error: "ring-1 ring-inset ring-status-error/25",
  info: "ring-1 ring-inset ring-status-info/25",
  neutral: "ring-1 ring-inset ring-fg-primary/15",
};

// 원형(pill)은 카운트·이름표처럼 통째로 하나의 값을 담는 자리, 각진 모서리(rounded)는
// 태그·상태처럼 다른 배지와 나란히 여러 개 늘어놓는 자리 — Avatar의 shape 구분과
// 같은 결로, 늘어놓았을 때의 리듬을 shape 하나로 신호한다. circle은 pill과 달리
// 텍스트 길이를 따라 늘어나지 않는 고정 정원 — 아이콘 코너에 얹는 짧은 카운트처럼
// 자리가 항상 같은 크기여야 하는 곳(LNB 등) 전용.
type BadgeShape = "rounded" | "pill" | "circle";

const SHAPE_CLASSNAME: Record<Exclude<BadgeShape, "circle">, string> = {
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

// 텍스트 폭에 맞춰 늘어나는 SIZE_CLASSNAME(px-*)과 달리, circle은 너비·높이를
// 고정해 정원을 유지한다 — 두 자리 이상 들어오면 흘러넘칠 수 있으니(예: "99"),
// 짧은 단일 값(카운트 1~2자리, 아이콘 하나)에만 쓴다. shrink-0 필수 — 부모가
// (NavItem의 코너 슬롯처럼) 더 작은 고정폭 flex 컨테이너면, 이게 없을 때
// 너비만 눌리고 높이는 그대로라 정원이 타원으로 찌그러진다.
const CIRCLE_SIZE_CLASSNAME: Record<BadgeSize, string> = {
  default:
    "flex size-5 shrink-0 items-center justify-center rounded-full p-0 text-[12px]",
  sm: "flex size-4 shrink-0 items-center justify-center rounded-full p-0 text-[10px]",
};

type BadgeProps = React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
  shape?: BadgeShape;
  size?: BadgeSize;
  // min-w-0 없이 truncate만 있으면 flex 안에서 조용히 안 먹으므로, 자체 flex
  // 아이템으로 감싸 항상 같이 묶는다.
  truncated?: boolean;
  // RING_CLASSNAME 참고 — variant="outline"엔 항상 자기 테두리가 있어 무시된다.
  outline?: boolean;
};

function Badge({
  variant,
  shape = "rounded",
  size = "default",
  truncated = false,
  outline = true,
  className,
  children,
  ...props
}: BadgeProps) {
  const tone = variantClasses[variant ?? "brand"];
  const ring =
    outline && variant !== "outline"
      ? RING_CLASSNAME[variant ?? "brand"]
      : undefined;
  const shapeSize =
    shape === "circle"
      ? CIRCLE_SIZE_CLASSNAME[size]
      : cn(SIZE_CLASSNAME[size], SHAPE_CLASSNAME[shape]);

  return (
    <span
      data-slot="badge"
      className={cn(
        // inline-flex + items-center — line-height 기반 baseline 정렬 대신 콘텐츠
        // 박스 기준으로 중앙을 맞춘다. 텍스트만 있을 땐 기존과 시각적으로 동일하고,
        // 아이콘처럼 폰트 메트릭과 안 맞는 자식이 섞여도 항상 정확히 중앙에 온다 —
        // 소비처가 아이콘 wrapper에 따로 정렬을 신경 쓸 필요가 없다.
        "inline-flex items-center py-0.5 font-medium leading-[1.4]",
        shapeSize,
        tone,
        ring,
        className,
      )}
      {...props}
    >
      {truncated ? (
        <span className="min-w-0 truncate">{children}</span>
      ) : (
        children
      )}
    </span>
  );
}

export { Badge, type BadgeShape, type BadgeSize, type BadgeVariant };

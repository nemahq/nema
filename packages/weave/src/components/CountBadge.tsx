import * as React from "react";

import { Badge, type BadgeSize, type BadgeVariant } from "./Badge";

// 두 자리(10)부터 원 안에 숫자가 안 들어가 pill로 넘어간다.
const CIRCLE_MAX_COUNT = 9;

type CountBadgeProps = Omit<
  React.ComponentProps<"span">,
  "children" | "color"
> & {
  count: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  outline?: boolean;
};

// 값 하나를 담는 카운트 전용 Badge — 한 자리는 정원(circle), 두 자리 이상은
// pill로 모양이 자동 전환된다. LNB Space 뱃지·탭 카운트처럼 반복되던
// "자리수 보고 shape 고르기"를 한곳에 모은다. outline 기본값이 Badge와
// 반대로 true인 이유 — 카운트 뱃지는 아이콘·아바타 위에 겹쳐 놓이는
// 경우가 잦아 경계 구분이 항상 필요하다.
function CountBadge({
  count,
  variant = "success",
  size,
  outline = true,
  ...props
}: CountBadgeProps) {
  return (
    <Badge
      variant={variant}
      shape={count > CIRCLE_MAX_COUNT ? "pill" : "circle"}
      size={size}
      outline={outline}
      {...props}
    >
      {count}
    </Badge>
  );
}

export { CountBadge, type CountBadgeProps };

import * as React from "react";

import { cn } from "../utils";
import { Skeleton } from "./Skeleton";
import { sizeClasses, type TextSize } from "./Text";

type TextSkeletonProps = {
  as?: React.ElementType;
  size?: TextSize;
  className?: string;
  // shimmer 애니메이션은 안쪽 Skeleton 막대에 있어서, 여기로 온 style은
  // (예: 스태거용 animationDelay) 그쪽으로 전달한다.
  style?: React.CSSProperties;
};

// 고정 px 대신 Text의 실제 line-box를 그대로 써서, 실컨텐츠로 바뀔 때
// 높이가 안 흔들리게 한다 — size 스케일이 바뀌어도 자동으로 따라간다.
// width/padding/margin은 Text와 같은 방식으로 여기 className에 지정한다
// (막대 자체가 아니라 이 줄 전체에 적용됨 — 폭을 좁히고 싶으면 여기서 준다).
function TextSkeleton({
  as,
  size = "base",
  className,
  style,
}: TextSkeletonProps) {
  const Comp = as ?? "div";

  return (
    <Comp
      data-slot="text-skeleton"
      aria-hidden
      className={cn(sizeClasses[size], className)}
    >
      <Skeleton
        className="inline-block h-[0.7em] w-full align-middle"
        style={style}
      />
    </Comp>
  );
}

export { TextSkeleton };

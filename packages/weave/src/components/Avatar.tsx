import * as React from "react";

import { cn } from "../utils";

type AvatarShape = "circle" | "square";

const SHAPE_CLASSNAME: Record<AvatarShape, string> = {
  circle: "rounded-full",
  square: "rounded-md",
};

interface AvatarProps extends Omit<React.ComponentProps<"span">, "children"> {
  src?: string;
  fallback: string;
  // 원형은 사람, 각진 모서리는 워크스페이스·Space 같은 공간을 가리킨다 — 이름이
  // 안 보이는 접힘 LNB에서도 무엇의 아바타인지 모양만으로 구분되게 한다.
  shape?: AvatarShape;
}

function Avatar({
  src,
  fallback,
  shape = "circle",
  className,
  ...props
}: AvatarProps) {
  const shapeClassName = SHAPE_CLASSNAME[shape];

  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center",
        shapeClassName,
        !src &&
          "bg-avatar-fallback text-xs font-medium text-avatar-fallback-fg",
        className,
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className={cn("size-full", shapeClassName)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

export { Avatar };

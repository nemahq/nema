import * as React from "react";

import { XIcon } from "../icons";
import { cn } from "../utils";
import { NEUTRAL_TONE_CLASSNAME, OUTLINE_TONE_CLASSNAME } from "./Badge";

type ChipVariant = "neutral" | "outline";
type ChipShape = "rounded" | "pill";

const STATIC_TONE_CLASSNAME: Record<ChipVariant, string> = {
  neutral: NEUTRAL_TONE_CLASSNAME,
  outline: OUTLINE_TONE_CLASSNAME,
};

// hover는 실제로 클릭되는 엘리먼트에만 얹는다 — remove 분기의 바깥 span처럼
// 그 자체는 안 눌리는 컨테이너에 씌우면 클릭 가능한 것처럼 보이는 거짓 신호가 된다.
// data-[state=open]도 같은 이유로 여기 묶는다 — DropdownMenuTrigger asChild로
// Chip을 쓰는 자리(DraftSpaceSelect 등)는 열려 있는 동안 눌린 것처럼 보여야
// 한다(#480, weave-usage.md).
const HOVER_CLASSNAME: Record<ChipVariant, string> = {
  neutral: "hover:bg-fg-primary/15 data-[state=open]:bg-fg-primary/15",
  outline: "hover:bg-fg-primary/5 data-[state=open]:bg-fg-primary/5",
};

// rounded는 태그·Topic처럼 여러 개를 나란히 늘어놓는 자리 — pill은 값 하나를
// 통째로 담는 자리(DraftSpaceSelect 등). Badge의 shape 구분과 같은 결.
const SHAPE_CLASSNAME: Record<ChipShape, string> = {
  rounded: "rounded-[4px]",
  pill: "rounded-full",
};

interface ChipRemove {
  onClick: () => void;
  ariaLabel: string;
}

// Badge(정적 라벨)와 짝을 이루는 인터랙티브 버전. remove가 없으면 항상 <button> —
// DropdownMenuTrigger asChild처럼 onClick이 아니라 onPointerDown 등 임의의
// prop으로 열림을 제어하는 소비처가 있어서, "정적이냐"를 어떤 prop 유무로
// 추론하면 안 되고 그냥 항상 버튼이어야 한다(정적 미리보기가 필요한 자리는
// Chip이 아니라 Badge를 쓴다). remove가 있으면 안에 실제 제거용 <button>이
// 하나 더 들어가야 하는데, <button> 안에 <button>을 중첩할 수 없어 그때만
// 루트를 <span>으로 바꾼다. Button은 base가 text-[13px] font-semibold를
// 강제해 되돌리는 비용이 커서 안 쓴다(weave-usage.md "Button" 표 "칩·pill 안
// 버튼" 제외 규칙 — 안의 라벨·제거 버튼도 같은 이유로 raw button).
function Chip({
  variant = "neutral",
  shape = "pill",
  className,
  type = "button",
  truncated = false,
  remove,
  onClick,
  disabled,
  children,
  ...props
}: React.ComponentPropsWithRef<"button"> & {
  variant?: ChipVariant;
  shape?: ChipShape;
  // min-w-0 없이 truncate만 있으면 flex 안에서 조용히 안 먹으므로 항상 같이 묶는다.
  truncated?: boolean;
  remove?: ChipRemove;
}) {
  const toneClassName = cn(
    SHAPE_CLASSNAME[shape],
    STATIC_TONE_CLASSNAME[variant],
  );
  const labelClassName = cn(truncated && "min-w-0 truncate");

  if (remove) {
    return (
      <span
        data-slot="chip"
        className={cn(
          "inline-flex items-center gap-1 py-0.5 pl-2 pr-1 text-[12px] font-medium leading-[1.4]",
          toneClassName,
          className,
        )}
      >
        {onClick ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
              labelClassName,
              HOVER_CLASSNAME[variant],
              "disabled:pointer-events-none",
            )}
          >
            {children}
          </button>
        ) : (
          <span className={labelClassName}>{children}</span>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-label={remove.ariaLabel}
          onClick={remove.onClick}
          className="rounded-full p-0.5 text-current/70 hover:bg-fg-primary/15 disabled:pointer-events-none"
        >
          <XIcon className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      type={type}
      data-slot="chip"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        toneClassName,
        HOVER_CLASSNAME[variant],
        labelClassName,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { Chip, type ChipShape, type ChipVariant };

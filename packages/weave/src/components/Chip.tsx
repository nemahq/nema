import * as React from "react";

import { cn } from "../utils";
import { NEUTRAL_TONE_CLASSNAME } from "./Badge";

type ChipVariant = "neutral" | "outline";

// neutral은 Badge neutral variant와 톤을 공유해서(NEUTRAL_TONE_CLASSNAME) 정적/
// 인터랙티브 버전이 항상 같은 색이다. outline은 채움 없이 테두리만 — Badge의
// outline variant와 같은 자리(값이 아직 없는 자리의 "추가" 트리거 등, 배경 틴트를
// 얹을 만한 값이 없을 때)에 쓴다. hover 없는 톤만 export하는 이유는, 넓은 투명
// 히트박스 안에 시각 전용 span으로 얹는 소비처는 자기 자신이 아니라 group-hover로
// 반응해야 해서 — hover 트리거를 Chip이 강제하면 그런 자리엔 못 쓴다.
export const CHIP_OUTLINE_TONE_CLASSNAME =
  "border border-border text-fg-tertiary";

const VARIANT_CLASSNAME: Record<ChipVariant, string> = {
  neutral: cn(NEUTRAL_TONE_CLASSNAME, "hover:bg-fg-primary/15"),
  outline: cn(CHIP_OUTLINE_TONE_CLASSNAME, "hover:bg-fg-primary/5"),
};

// Badge(정적 라벨)와 짝을 이루는 인터랙티브 버전 — 값 하나를 보여주다가 클릭하면
// DropdownMenu 등으로 바꿀 수 있는 pill. Button은 base가 text-[13px] font-semibold를
// 강제해 되돌리는 비용이 커서 안 쓴다(weave-usage.md "Button" 표 "칩·pill 안 버튼"
// 제외 규칙).
function Chip({
  variant = "neutral",
  className,
  type = "button",
  truncated = false,
  ...props
}: React.ComponentPropsWithRef<"button"> & {
  variant?: ChipVariant;
  // min-w-0 없이 truncate만 있으면 flex 안에서 조용히 안 먹으므로 항상 같이 묶는다.
  truncated?: boolean;
}) {
  return (
    <button
      type={type}
      data-slot="chip"
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSNAME[variant],
        truncated && "min-w-0 truncate",
        className,
      )}
      {...props}
    />
  );
}

export { Chip, type ChipVariant };

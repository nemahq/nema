import * as React from "react";

import { cn } from "../utils";
import { NEUTRAL_TONE_CLASSNAME } from "./Badge";

type ChipVariant = "neutral";

// Badge neutral variant와 톤을 공유해서(NEUTRAL_TONE_CLASSNAME) 정적/인터랙티브
// 버전이 항상 같은 색이다.
const VARIANT_CLASSNAME: Record<ChipVariant, string> = {
  neutral: cn(NEUTRAL_TONE_CLASSNAME, "hover:bg-fg-primary/15"),
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

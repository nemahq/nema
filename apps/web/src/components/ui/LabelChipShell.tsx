import type { ReactNode } from "react";

import { Badge, type BadgeVariant } from "@nema-io/weave";
import { XIcon } from "@nema-io/weave/icons";

interface LabelChipShellProps {
  variant: BadgeVariant;
  disabled: boolean;
  removeAriaLabel: string;
  onRemove: () => void;
  children: ReactNode;
}

// 제거 버튼은 weave Button 대신 raw button — 칩 안에서 Badge의 색·크기를 그대로
// 물려받아야 하는데 Button base가 자기 타이포·패딩을 강제해 안 맞는다
// (weave-usage.md "Button" 표 "칩·pill 안 버튼" 제외 규칙). 카드 삭제 버튼과 같은
// 이유로 기본 숨김 — opacity-0, group(칩) hover·focus-visible에서만 노출.
export function LabelChipShell({
  variant,
  disabled,
  removeAriaLabel,
  onRemove,
  children,
}: LabelChipShellProps) {
  return (
    <Badge
      variant={variant}
      className="group inline-flex items-center gap-1 py-0.5 pr-1"
    >
      {children}
      <button
        type="button"
        disabled={disabled}
        aria-label={removeAriaLabel}
        onClick={onRemove}
        className="rounded-full p-0.5 text-current/70 opacity-0 transition-none hover:bg-black/10 focus-visible:opacity-100 disabled:pointer-events-none group-hover:opacity-100 dark:hover:bg-white/10"
      >
        <XIcon className="size-3" />
      </button>
    </Badge>
  );
}

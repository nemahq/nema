import type { BadgeVariant } from "@nema-io/weave";

import { LabelChipShell } from "./LabelChipShell";

interface DraftLabelChipProps {
  label: string;
  variant: BadgeVariant;
  disabled: boolean;
  removeAriaLabel: string;
  onNameChange: (label: string) => void;
  onRemove: () => void;
}

// 아직 서버에 없는 Topic·Tag 후보 — 확정 전까지 이름을 고칠 수 있다
// (review-flow.md "신규 Topic·Tag 이름 수정 가능").
export function DraftLabelChip({
  label,
  variant,
  disabled,
  removeAriaLabel,
  onNameChange,
  onRemove,
}: DraftLabelChipProps) {
  return (
    <LabelChipShell
      variant={variant}
      disabled={disabled}
      removeAriaLabel={removeAriaLabel}
      onRemove={onRemove}
    >
      <input
        value={label}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={disabled}
        size={Math.max(label.length, 1)}
        className="min-w-[2ch] bg-transparent disabled:opacity-50"
      />
    </LabelChipShell>
  );
}

import { Chip, type ChipVariant } from "@nema-io/weave";

interface RegisteredLabelChipProps {
  label: string;
  variant: ChipVariant;
  disabled: boolean;
  removeAriaLabel: string;
  onRemove: () => void;
}

// 레지스트리에 이미 있는 Topic·Tag — 이름은 읽기 전용이고 제거만 된다
// (review-flow.md "기존 Topic·Tag는 이름 수정 불가").
export function RegisteredLabelChip({
  label,
  variant,
  disabled,
  removeAriaLabel,
  onRemove,
}: RegisteredLabelChipProps) {
  return (
    <Chip
      variant={variant}
      shape="rounded"
      disabled={disabled}
      remove={{ onClick: onRemove, ariaLabel: removeAriaLabel }}
    >
      {label}
    </Chip>
  );
}

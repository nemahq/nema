import { Badge, type BadgeVariant } from "@nema-io/weave";
import { XIcon } from "@nema-io/weave/icons";

interface EditableLabelChipProps {
  label: string;
  readOnly: boolean;
  disabled: boolean;
  variant: BadgeVariant;
  removeAriaLabel: string;
  onNameChange?: (value: string) => void;
  onRemove: () => void;
}

export function EditableLabelChip({
  label,
  readOnly,
  disabled,
  variant,
  removeAriaLabel,
  onNameChange,
  onRemove,
}: EditableLabelChipProps) {
  return (
    <Badge
      variant={variant}
      className="inline-flex items-center gap-1 py-0.5 pr-1"
    >
      {readOnly ? (
        <span>{label}</span>
      ) : (
        <input
          value={label}
          onChange={(e) => onNameChange?.(e.target.value)}
          disabled={disabled}
          size={Math.max(label.length, 1)}
          className="min-w-[2ch] bg-transparent disabled:opacity-50"
        />
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label={removeAriaLabel}
        onClick={onRemove}
        className="rounded-full p-0.5 text-current/70 hover:bg-black/10 disabled:pointer-events-none dark:hover:bg-white/10"
      >
        <XIcon className="size-3" />
      </button>
    </Badge>
  );
}

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
      className="inline-flex items-center gap-1 py-0.5 pr-1"
    >
      {children}
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

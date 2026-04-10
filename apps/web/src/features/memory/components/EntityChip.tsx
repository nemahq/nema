interface EntityChipProps {
  name: string;
  documentCount: number;
  selected?: boolean;
  onClick?: () => void;
}

export function EntityChip({
  name,
  documentCount,
  selected,
  onClick,
}: EntityChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3.5 py-1.5 text-left transition-colors ${
        selected
          ? "border-brand bg-brand/8"
          : "border-border bg-surface-raised hover:border-fg-tertiary/40 hover:bg-surface-raised/80"
      }`}
    >
      <span className="text-[13px] font-medium text-fg-primary">{name}</span>
      <span className="text-[11px] text-fg-tertiary">{documentCount}</span>
    </button>
  );
}

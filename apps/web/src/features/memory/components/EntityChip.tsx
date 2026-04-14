interface EntityChipProps {
  name: string;
  documentCount: number;
}

export function EntityChip({ name, documentCount }: EntityChipProps) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface-raised px-3.5 py-1.5">
      <span className="text-[13px] font-medium text-fg-primary">{name}</span>
      <span className="text-[11px] text-fg-tertiary">{documentCount}</span>
    </div>
  );
}

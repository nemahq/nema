interface SettingsSectionHeaderProps {
  label: string;
}

export function SettingsSectionHeader({ label }: SettingsSectionHeaderProps) {
  return (
    <div className="border-b border-border pb-2">
      <span className="text-xs font-semibold tracking-wide text-fg-tertiary uppercase">
        {label}
      </span>
    </div>
  );
}

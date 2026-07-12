interface SettingsSectionHeaderProps {
  label: string;
}

export function SettingsSectionHeader({ label }: SettingsSectionHeaderProps) {
  return (
    <div className="border-b border-border pb-2">
      <span className="text-base font-semibold tracking-wide text-fg-primary">
        {label}
      </span>
    </div>
  );
}

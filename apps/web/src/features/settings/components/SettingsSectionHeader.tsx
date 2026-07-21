import { Text } from "@nema-io/weave";

interface SettingsSectionHeaderProps {
  label: string;
}

export function SettingsSectionHeader({ label }: SettingsSectionHeaderProps) {
  return (
    <div className="border-b border-border pb-2">
      <Text as="span" size="lg" weight="semibold">
        {label}
      </Text>
    </div>
  );
}

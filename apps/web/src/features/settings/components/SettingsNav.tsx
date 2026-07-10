import { User, Wrench } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

export type SettingsSection = "general" | "account";

const NAV_ITEMS: {
  value: SettingsSection;
  Icon: typeof User;
  labelKey: "settings.nav_general" | "settings.nav_account";
}[] = [
  { value: "general", Icon: Wrench, labelKey: "settings.nav_general" },
  { value: "account", Icon: User, labelKey: "settings.nav_account" },
];

interface SettingsNavProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export function SettingsNav({ section, onSectionChange }: SettingsNavProps) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("settings.settings")}
      className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-surface-raised p-4"
    >
      {NAV_ITEMS.map(({ value, Icon, labelKey }) => (
        <button
          key={value}
          type="button"
          aria-current={section === value ? "true" : undefined}
          onClick={() => onSectionChange(value)}
          className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            section === value
              ? "bg-surface-raised-hover text-fg-primary"
              : "text-fg-tertiary hover:bg-surface-raised-hover hover:text-fg-secondary"
          }`}
        >
          <Icon className="size-4" />
          {t(labelKey)}
        </button>
      ))}
    </nav>
  );
}

import { Monitor, Moon, Sun } from "@nema-io/weave/icons";

import { useTheme } from "@web/app/providers/ThemeProvider";
import { useTranslation } from "@web/lib/tolgee";
import type { ThemePreference } from "@web/utils/theme-preference";

const THEME_OPTIONS: {
  value: ThemePreference;
  Icon: typeof Sun;
  labelKey:
    | "settings.theme_light"
    | "settings.theme_dark"
    | "settings.theme_system";
}[] = [
  { value: "light", Icon: Sun, labelKey: "settings.theme_light" },
  { value: "dark", Icon: Moon, labelKey: "settings.theme_dark" },
  { value: "system", Icon: Monitor, labelKey: "settings.theme_system" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div
      role="radiogroup"
      aria-label={t("settings.theme")}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised p-1"
    >
      {THEME_OPTIONS.map(({ value, Icon, labelKey }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={`flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] font-medium transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            theme === value
              ? "bg-surface-card text-fg-primary shadow-sm"
              : "text-fg-tertiary hover:text-fg-secondary"
          }`}
        >
          <Icon className="size-4" />
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}

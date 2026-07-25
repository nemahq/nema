import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { useTheme } from "@web/app/providers/ThemeProvider";
import { useTranslation } from "@web/lib/tolgee";
import type { ThemePreference } from "@web/utils/theme-preference";

function isThemePreference(value: string): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

const THEME_OPTIONS: {
  value: ThemePreference;
  labelKey:
    | "settings.theme_light"
    | "settings.theme_dark"
    | "settings.theme_system";
}[] = [
  { value: "light", labelKey: "settings.theme_light" },
  { value: "dark", labelKey: "settings.theme_dark" },
  { value: "system", labelKey: "settings.theme_system" },
];

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <Select
      value={theme}
      onValueChange={(v) => {
        if (isThemePreference(v)) {
          setTheme(v);
        }
      }}
    >
      <SelectTrigger aria-label={t("settings.theme")} className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {THEME_OPTIONS.map(({ value, labelKey }) => (
          <SelectItem key={value} value={value}>
            {t(labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

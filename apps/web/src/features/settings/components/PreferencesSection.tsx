import { useId, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { LANGUAGE_LABELS } from "@web/features/profile";
import {
  changeLocale,
  isLocale,
  type Locale,
  LOCALES,
  tolgee,
  useTranslation,
} from "@web/lib/tolgee";
import { toastError } from "@web/utils/toast";

import { SettingsRow } from "./SettingsRow";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { ThemeSelect } from "./ThemeSelect";

export function PreferencesSection() {
  const { t } = useTranslation();
  const appLangId = useId();
  const [appLang, setAppLang] = useState<Locale>(() => {
    const lang = tolgee.getLanguage();
    return lang && isLocale(lang) ? lang : "ko";
  });

  async function handleAppLangChange(v: string) {
    if (!isLocale(v)) {
      return;
    }
    const previousLang = appLang;
    setAppLang(v);
    try {
      await changeLocale(v);
    } catch (error) {
      setAppLang(previousLang);
      toastError(error);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg-primary">
          {t("settings.nav_preferences")}
        </h2>
        <p className="text-xs text-fg-tertiary">
          {t("settings.preferences_subtitle")}
        </p>
      </div>

      <div className="mt-6 flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <SettingsSectionHeader label={t("settings.appearance_section")} />
          <SettingsRow
            label={t("settings.theme")}
            description={t("settings.theme_description")}
          >
            <ThemeSelect />
          </SettingsRow>
        </div>

        <div className="flex flex-col gap-2">
          <SettingsSectionHeader label={t("settings.language_section")} />
          <SettingsRow
            label={t("settings.app_language")}
            description={t("settings.app_language_description")}
            htmlFor={appLangId}
          >
            <Select value={appLang} onValueChange={handleAppLangChange}>
              <SelectTrigger id={appLangId} className="w-44 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((lang) => (
                  <SelectItem
                    key={lang}
                    value={lang}
                    className="cursor-pointer"
                  >
                    {LANGUAGE_LABELS[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </div>
      </div>
    </div>
  );
}

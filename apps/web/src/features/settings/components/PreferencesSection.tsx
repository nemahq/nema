import { useId, useState } from "react";

import {
  Button,
  DialogFooter,
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

import { SettingsRow } from "./SettingsRow";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { ThemeToggle } from "./ThemeToggle";

interface PreferencesSectionProps {
  onOpenChange: (open: boolean) => void;
}

export function PreferencesSection({ onOpenChange }: PreferencesSectionProps) {
  const { t } = useTranslation();
  const appLangId = useId();
  const [appLang, setAppLang] = useState<Locale>(() => {
    const lang = tolgee.getLanguage();
    return lang && isLocale(lang) ? lang : "ko";
  });

  function handleSave() {
    changeLocale(appLang);
    onOpenChange(false);
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
            <ThemeToggle />
          </SettingsRow>
        </div>

        <div className="flex flex-col gap-2">
          <SettingsSectionHeader label={t("settings.language_section")} />
          <SettingsRow
            label={t("settings.app_language")}
            description={t("settings.app_language_description")}
            htmlFor={appLangId}
          >
            <Select
              value={appLang}
              onValueChange={(v) => {
                if (isLocale(v)) {
                  setAppLang(v);
                }
              }}
            >
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

      <DialogFooter className="mt-6 border-t border-border pt-4">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave}>{t("settings.save")}</Button>
      </DialogFooter>
    </div>
  );
}

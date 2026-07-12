import { useState } from "react";

import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  ContentLanguageSchema,
} from "@nema-io/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import {
  LANGUAGE_LABELS,
  useProfileQuery,
  useUpdateProfile,
} from "@web/features/profile";
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
  const [appLang, setAppLang] = useState<Locale>(() => {
    const lang = tolgee.getLanguage();
    return lang && isLocale(lang) ? lang : "ko";
  });

  // 온보딩을 거쳐야 설정 화면에 닿으므로 profile은 항상 존재한다.
  const { data: profile } = useProfileQuery();
  const updateProfileMutation = useUpdateProfile();
  const [contentLang, setContentLang] = useState<ContentLanguage>(
    () => profile?.contentLanguage ?? "en",
  );

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

  function handleContentLangChange(v: string) {
    const parsed = ContentLanguageSchema.safeParse(v);
    if (!parsed.success) {
      return;
    }
    const previousLang = contentLang;
    setContentLang(parsed.data);
    updateProfileMutation.mutate(
      { contentLanguage: parsed.data },
      {
        onError: (error) => {
          setContentLang(previousLang);
          toastError(error);
        },
      },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-fg-primary">
          {t("settings.nav_preferences")}
        </h2>
        <p className="text-sm text-fg-tertiary">
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
            divider={false}
          >
            <Select value={appLang} onValueChange={handleAppLangChange}>
              <SelectTrigger className="w-44 cursor-pointer shadow-none dark:shadow-sm">
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
          <SettingsRow
            label={t("settings.content_language")}
            description={t("settings.content_language_description")}
          >
            <Select value={contentLang} onValueChange={handleContentLangChange}>
              <SelectTrigger className="w-44 cursor-pointer shadow-none dark:shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_LANGUAGES.map((lang) => (
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

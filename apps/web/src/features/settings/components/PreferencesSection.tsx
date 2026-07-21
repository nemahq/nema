import { Suspense, useState } from "react";

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
  Skeleton,
  Text,
} from "@nema-io/weave";

import {
  LANGUAGE_LABELS,
  useProfileSuspenseQuery,
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

// contentLanguage를 마운트 시점에 useState로 시드하므로, 여기만 profile을 서스펜드해
// 값이 확정된 뒤 초기화한다 — 그러지 않으면 profile 도착 전 마운트 시 "en"으로 잘못
// 시드되고(useState 초기화는 1회뿐) 실제 값이 와도 갱신되지 않는다.
function ContentLanguageSelect() {
  const [profile] = useProfileSuspenseQuery();
  const updateProfileMutation = useUpdateProfile();
  const [contentLang, setContentLang] = useState<ContentLanguage>(
    profile?.contentLanguage ?? "en",
  );

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
    <Select value={contentLang} onValueChange={handleContentLangChange}>
      <SelectTrigger className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CONTENT_LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {LANGUAGE_LABELS[lang]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PreferencesSection() {
  const { t } = useTranslation();
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
        <Text as="h2" size="xl" weight="semibold">
          {t("settings.nav_preferences")}
        </Text>
        <Text size="sm" color="tertiary">
          {t("settings.preferences_subtitle")}
        </Text>
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
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((lang) => (
                  <SelectItem key={lang} value={lang}>
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
            <Suspense fallback={<Skeleton className="h-9 w-36 rounded-md" />}>
              <ContentLanguageSelect />
            </Suspense>
          </SettingsRow>
        </div>
      </div>
    </div>
  );
}

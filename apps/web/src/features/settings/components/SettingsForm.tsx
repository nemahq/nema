import { Suspense, useId, useState } from "react";

import type { ContentLanguage } from "@nema-io/shared";
import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

import { ContentLanguageSection } from "./ContentLanguageSection";

interface SettingsFormProps {
  onOpenChange: (open: boolean) => void;
}

function SettingsFormInner({ onOpenChange }: SettingsFormProps) {
  const { t } = useTranslation();
  const [profile] = useProfileSuspenseQuery();
  const appLangId = useId();
  const [contentLang, setContentLang] = useState<ContentLanguage>(
    profile?.contentLanguage ?? "ko",
  );
  const [appLang, setAppLang] = useState<Locale>(() => {
    const lang = tolgee.getLanguage();
    return lang && isLocale(lang) ? lang : "ko";
  });

  const updateMutation = useUpdateProfile();

  function handleSave() {
    updateMutation.mutate(
      { contentLanguage: contentLang },
      {
        onSuccess: () => {
          changeLocale(appLang);
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("settings.settings")}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={appLangId}
            className="text-sm font-medium text-fg-primary"
          >
            {t("settings.app_language")}
          </label>
          <p className="text-xs text-fg-tertiary">
            {t("settings.app_language_description")}
          </p>
          <Select
            value={appLang}
            onValueChange={(v) => {
              if (isLocale(v)) {
                setAppLang(v);
              }
            }}
          >
            <SelectTrigger id={appLangId} className="cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((lang) => (
                <SelectItem key={lang} value={lang} className="cursor-pointer">
                  {LANGUAGE_LABELS[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ContentLanguageSection value={contentLang} onChange={setContentLang} />
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {t("settings.save")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function SettingsForm({ onOpenChange }: SettingsFormProps) {
  return (
    <Suspense>
      <SettingsFormInner onOpenChange={onOpenChange} />
    </Suspense>
  );
}

import { useId, useState } from "react";

import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  ContentLanguageSchema,
} from "@nema-io/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { useUpdateProfile } from "@web/features/profile/hooks/useUpdateProfile";
import { changeLocale, useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";
import { isLocale, type Locale, LOCALES } from "@web/lib/tolgee/types";

const LANGUAGE_LABELS: Record<string, string> = {
  ko: "한국어",
  en: "English",
};

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentContentLanguage: ContentLanguage;
}

export function SettingsModal({
  open,
  onOpenChange,
  currentContentLanguage,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const appLangId = useId();
  const contentLangId = useId();
  const [contentLang, setContentLang] = useState<ContentLanguage>(
    currentContentLanguage,
  );
  const [appLang, setAppLang] = useState<Locale>(
    (() => {
      const lang = tolgee.getLanguage();
      return lang && isLocale(lang) ? lang : "ko";
    })(),
  );

  const updateMutation = useUpdateProfile();

  function handleSave() {
    changeLocale(appLang);
    updateMutation.mutate(
      { contentLanguage: contentLang },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={contentLangId}
              className="text-sm font-medium text-fg-primary"
            >
              {t("settings.content_language")}
            </label>
            <p className="text-xs text-fg-tertiary">
              {t("settings.content_language_description")}
            </p>
            <Select
              value={contentLang}
              onValueChange={(v) => {
                const parsed = ContentLanguageSchema.safeParse(v);
                if (parsed.success) {
                  setContentLang(parsed.data);
                }
              }}
            >
              <SelectTrigger id={contentLangId} className="cursor-pointer">
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {t("settings.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

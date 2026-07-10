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

import { ThemeToggle } from "./ThemeToggle";

interface GeneralSectionProps {
  onOpenChange: (open: boolean) => void;
}

export function GeneralSection({ onOpenChange }: GeneralSectionProps) {
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
      <h2 className="text-base font-semibold text-fg-primary">
        {t("settings.nav_general")}
      </h2>

      <div className="mt-5 flex flex-1 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-primary">
            {t("settings.theme")}
          </span>
          <p className="text-xs text-fg-tertiary">
            {t("settings.theme_description")}
          </p>
          <ThemeToggle />
        </div>

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
      </div>

      <DialogFooter className="mt-6">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave}>{t("settings.save")}</Button>
      </DialogFooter>
    </div>
  );
}

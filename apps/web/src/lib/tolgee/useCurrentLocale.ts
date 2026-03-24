import { useTolgee } from "@tolgee/react";

import { changeLocale } from "./locale";
import { isLocale, type Locale } from "./types";

const DEFAULT_LOCALE: Locale = "ko";

export function useCurrentLocale() {
  const tolgee = useTolgee(["language"]);
  const lang = tolgee.getLanguage();
  const locale: Locale = lang && isLocale(lang) ? lang : DEFAULT_LOCALE;

  return [locale, changeLocale] as const;
}

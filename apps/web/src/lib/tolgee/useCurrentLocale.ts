import { useTolgee } from "@tolgee/react";

import { isLocale, type Locale } from "./types";

const DEFAULT_LOCALE: Locale = "ko";

export function useCurrentLocale(): Locale {
  const tolgee = useTolgee(["language"]);
  const lang = tolgee.getLanguage();
  return lang && isLocale(lang) ? lang : DEFAULT_LOCALE;
}

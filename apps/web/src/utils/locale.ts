import { type Locale, LOCALES } from "@nema-io/shared";

import { getStorage } from "@web/utils/localStorage";

export function detectLanguage(): Locale {
  const stored = getStorage("locale");
  if (stored) {
    return stored;
  }

  const browserLang = navigator?.language?.split("-")[0];
  if ((LOCALES as readonly string[]).includes(browserLang ?? "")) {
    return browserLang as Locale;
  }
  return "ko";
}

import { setStorage } from "@web/utils/localStorage";

import { tolgee } from "./client";
import type { Locale } from "./types";

export function changeLocale(locale: Locale) {
  tolgee.changeLanguage(locale).then(() => setStorage("locale", locale));
}

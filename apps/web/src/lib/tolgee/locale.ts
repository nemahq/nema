import { setStorage } from "@web/utils/localStorage";

import { tolgee } from "./client";
import type { Locale } from "./types";

export async function changeLocale(locale: Locale): Promise<void> {
  await tolgee.changeLanguage(locale);
  setStorage("locale", locale);
}

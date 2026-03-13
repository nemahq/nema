import { BackendFetch, FormatSimple, Tolgee } from "@tolgee/react";

import { getEnv } from "@web/app/env";
import { getStorage } from "@web/utils/localStorage";

import en from "./en.json";
import ko from "./ko.json";
import { type Locale, LOCALES } from "./types";

function detectLanguage(): Locale {
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

const { TOLGEE_CDN_URL } = getEnv();
const tolgeeBuilder = Tolgee().use(FormatSimple());

if (TOLGEE_CDN_URL) {
  tolgeeBuilder.use(
    BackendFetch({ prefix: TOLGEE_CDN_URL, fallbackOnFail: true }),
  );
}

export const tolgee = tolgeeBuilder.init({
  language: detectLanguage(),
  staticData: { ko, en },
});

import { FormatSimple, Tolgee } from "@tolgee/react";

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

// TODO: 번역 키 규모 증가 시 staticData → CDN fetch 전환
const staticData: Record<Locale, typeof ko> = { ko, en };

export const tolgee = Tolgee().use(FormatSimple()).init({
  language: detectLanguage(),
  staticData,
});

import { FormatSimple, TolgeeCore, type TolgeeInstance } from "@tolgee/core";

import { type Locale, LOCALES } from "@nema-io/shared";

import en from "./locales/en.json";
import ko from "./locales/ko.json";

const DEFAULT_LANGUAGE: Locale = "ko";

let tolgee: TolgeeInstance;

export async function initI18n(): Promise<void> {
  tolgee = TolgeeCore().use(FormatSimple()).init({
    language: DEFAULT_LANGUAGE,
    staticData: { ko, en },
  });
  await tolgee.run();
}

export function resolveLanguage(acceptLanguageHeader?: string): Locale {
  if (!acceptLanguageHeader) return DEFAULT_LANGUAGE;

  for (const part of acceptLanguageHeader.split(",")) {
    const lang = part.split(";")[0].trim().split("-")[0];
    if ((LOCALES as readonly string[]).includes(lang)) {
      return lang as Locale;
    }
  }

  return DEFAULT_LANGUAGE;
}

export function t(key: string, lng: Locale): string {
  return tolgee.t(key, undefined, { language: lng });
}

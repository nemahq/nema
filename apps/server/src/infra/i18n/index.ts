import { FormatSimple, TolgeeCore, type TolgeeInstance } from "@tolgee/core";

import { isLocale, type Locale } from "@nema-io/shared";

import en from "./locales/en.json";
import ko from "./locales/ko.json";

type Flatten<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? Flatten<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>
    : Prefix extends ""
      ? K
      : `${Prefix}.${K}`;
}[keyof T & string];

export type TranslationKey = Flatten<typeof ko>;

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
  if (!acceptLanguageHeader) {
    return DEFAULT_LANGUAGE;
  }

  for (const part of acceptLanguageHeader.split(",")) {
    const lang = part.split(";")[0].trim().split("-")[0];
    if (isLocale(lang)) {
      return lang;
    }
  }

  return DEFAULT_LANGUAGE;
}

export function t(
  key: TranslationKey,
  options: { lng: Locale; params?: Record<string, string | number> },
): string {
  if (!tolgee) {
    throw new Error("i18n not initialized — call initI18n() first");
  }
  return tolgee.t(key, { ...options.params, language: options.lng });
}

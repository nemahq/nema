import type ko from "./ko.json";

export { isLocale, type Locale, LOCALES } from "@nema-io/shared";

type Flatten<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? Flatten<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>
    : Prefix extends ""
      ? K
      : `${Prefix}.${K}`;
}[keyof T & string];

export type TranslationKey = Flatten<typeof ko>;

import type ko from "./ko.json";

type Flatten<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? Flatten<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>
    : Prefix extends ""
      ? K
      : `${Prefix}.${K}`;
}[keyof T & string];

export type TranslationKey = Flatten<typeof ko>;

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

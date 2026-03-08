import type { Locale } from "./i18n/types";
import { LOCALES } from "./i18n/types";
import type { ThemePreference } from "./theme";

type StorageMap = {
  theme: ThemePreference;
  locale: Locale;
};

const isValid: {
  [K in keyof StorageMap]: (v: string) => v is StorageMap[K];
} = {
  theme: (v): v is StorageMap["theme"] =>
    v === "dark" || v === "light" || v === "system",
  locale: (v): v is StorageMap["locale"] =>
    (LOCALES as readonly string[]).includes(v),
};

export function getStorage<K extends keyof StorageMap>(
  key: K,
): StorageMap[K] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null && isValid[key](raw)) return raw as StorageMap[K];
    return null;
  } catch {
    return null;
  }
}

export function setStorage<K extends keyof StorageMap>(
  key: K,
  value: StorageMap[K],
): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 의도적 무시
  }
}

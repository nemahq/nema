import type { Locale } from "@web/lib/tolgee/types";
import { isLocale } from "@web/lib/tolgee/types";

import { type BooleanString, isBooleanString } from "./serialization";
import type { ThemePreference } from "./theme";
import { isThemePreference } from "./theme";

type StorageMap = {
  theme: ThemePreference;
  locale: Locale;
  sidebarCollapsed: BooleanString;
};

const isValid: {
  [K in keyof StorageMap]: (v: string) => v is StorageMap[K];
} = {
  theme: isThemePreference,
  locale: isLocale,
  sidebarCollapsed: isBooleanString,
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

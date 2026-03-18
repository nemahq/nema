import type { Locale } from "@web/lib/tolgee/types";
import { isLocale } from "@web/lib/tolgee/types";

import { type BooleanString, isBooleanString } from "./serialization";
import type { ThemePreference } from "./theme-preference";
import { isThemePreference } from "./theme-preference";

type JsonRecord = string & { __brand?: "JsonRecord" };

function isJsonRecord(v: string): v is JsonRecord {
  try {
    const parsed: unknown = JSON.parse(v);
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}

type StorageMap = {
  theme: ThemePreference;
  locale: Locale;
  sidebarCollapsed: BooleanString;
  chatDrafts: JsonRecord;
};

const isValid: {
  [K in keyof StorageMap]: (v: string) => v is StorageMap[K];
} = {
  theme: isThemePreference,
  locale: isLocale,
  sidebarCollapsed: isBooleanString,
  chatDrafts: isJsonRecord,
};

export function getStorage<K extends keyof StorageMap>(
  key: K,
): StorageMap[K] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null && isValid[key](raw)) {
      return raw as StorageMap[K];
    }
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

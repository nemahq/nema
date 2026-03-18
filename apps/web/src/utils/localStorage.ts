import type { Locale } from "@web/lib/tolgee/types";
import { isLocale } from "@web/lib/tolgee/types";

import type { BooleanString, JsonRecord } from "./serialization";
import { isBooleanString, isJsonRecord } from "./serialization";
import type { ThemePreference } from "./theme-preference";
import { isThemePreference } from "./theme-preference";

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

type JsonRecordKey = {
  [K in keyof StorageMap]: StorageMap[K] extends JsonRecord ? K : never;
}[keyof StorageMap];

export function getRecordStorage(key: JsonRecordKey): Record<string, string> {
  const raw = getStorage(key);
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as Record<string, string>;
}

export function setRecordStorage(
  key: JsonRecordKey,
  value: Record<string, string>,
): void {
  setStorage(key, JSON.stringify(value) as JsonRecord);
}

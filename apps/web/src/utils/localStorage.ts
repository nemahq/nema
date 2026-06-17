import { CHAT_MODES, type ChatMode } from "@nema-io/shared";

import type { Locale } from "@web/lib/tolgee/types";
import { isLocale } from "@web/lib/tolgee/types";

import type { BooleanString, JsonRecord } from "./serialization";
import { isBooleanString, isJsonRecord } from "./serialization";
import type { ThemePreference } from "./theme-preference";
import { isThemePreference } from "./theme-preference";

function isChatMode(v: string): v is ChatMode {
  return (CHAT_MODES as readonly string[]).includes(v);
}

type StorageMap = {
  theme: ThemePreference;
  locale: Locale;
  sidebarCollapsed: BooleanString;
  chatDrafts: JsonRecord;
  chatMode: ChatMode;
  openRetrievalTabs: JsonRecord;
  splitLayout: JsonRecord;
  // OAuth 공급자 왕복에서 URL 쿼리가 깎여도 복구하도록 authorization_id를 잠시 보관.
  oauthAuthorizationId: string;
};

const isValid: {
  [K in keyof StorageMap]: (v: string) => v is StorageMap[K];
} = {
  theme: isThemePreference,
  locale: isLocale,
  sidebarCollapsed: isBooleanString,
  chatDrafts: isJsonRecord,
  chatMode: isChatMode,
  openRetrievalTabs: isJsonRecord,
  splitLayout: isJsonRecord,
  oauthAuthorizationId: (v): v is string => v.length > 0,
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

export function removeStorage<K extends keyof StorageMap>(key: K): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 의도적 무시
  }
}

type JsonRecordKey = {
  [K in keyof StorageMap]: StorageMap[K] extends JsonRecord ? K : never;
}[keyof StorageMap];

function readRecord(key: JsonRecordKey): Record<string, string> {
  const raw = getStorage(key);
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as Record<string, string>;
}

function writeRecord(key: JsonRecordKey, record: Record<string, string>): void {
  setStorage(key, JSON.stringify(record) as JsonRecord);
}

export function getRecordEntry(
  key: JsonRecordKey,
  entryKey: string,
): string | null {
  return readRecord(key)[entryKey] ?? null;
}

export function setRecordEntry(
  key: JsonRecordKey,
  entryKey: string,
  entryValue: string,
): void {
  const record = readRecord(key);
  record[entryKey] = entryValue;
  writeRecord(key, record);
}

export function deleteRecordEntry(key: JsonRecordKey, entryKey: string): void {
  const record = readRecord(key);
  const rest = Object.fromEntries(
    Object.entries(record).filter(([k]) => k !== entryKey),
  );
  writeRecord(key, rest);
}

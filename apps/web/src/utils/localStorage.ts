import type { Locale } from "@web/lib/tolgee/types";
import { isLocale } from "@web/lib/tolgee/types";

import type { BooleanString } from "./serialization";
import { isBooleanString } from "./serialization";
import type { ThemePreference } from "./theme-preference";
import { isThemePreference } from "./theme-preference";

type StorageMap = {
  theme: ThemePreference;
  locale: Locale;
  sidebarCollapsed: BooleanString;
  // OAuth 공급자 왕복에서 URL 쿼리가 깎여도 복구하도록 authorization_id를 잠시 보관.
  oauthAuthorizationId: string;
  // 스텔스 모드에서 Coming Soon 대신 실제 로그인을 보여줄지 여부. /signin?access=<key>로 심는 write-once 플래그라 "true"만 가능.
  previewAccess: "true";
};

const isValid: {
  [K in keyof StorageMap]: (v: string) => v is StorageMap[K];
} = {
  theme: isThemePreference,
  locale: isLocale,
  sidebarCollapsed: isBooleanString,
  oauthAuthorizationId: (v): v is string => v.length > 0,
  previewAccess: (v): v is "true" => v === "true",
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

import type { Locale } from "./i18n/types.js";

type StorageMap = {
  theme: "dark" | "light" | "system";
  locale: Locale;
};

const isValid: {
  [K in keyof StorageMap]: (v: string) => v is StorageMap[K];
} = {
  theme: (v): v is StorageMap["theme"] =>
    v === "dark" || v === "light" || v === "system",
  locale: (v): v is StorageMap["locale"] => v === "ko" || v === "en",
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
    // localStorage 미지원 환경 (SSR, 시크릿 모드 등)
  }
}

type StorageMap = {
  theme: "dark" | "light" | "system";
  locale: "ko" | "en";
};

type StorageKey = keyof StorageMap;

export function getStorage<K extends StorageKey>(key: K): StorageMap[K] | null {
  try {
    return localStorage.getItem(key) as StorageMap[K] | null;
  } catch {
    return null;
  }
}

export function setStorage<K extends StorageKey>(
  key: K,
  value: StorageMap[K],
): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 실패 무시
  }
}

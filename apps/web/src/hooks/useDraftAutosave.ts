import { useCallback, useEffect, useRef, useState } from "react";

interface UseDraftAutosaveOptions {
  /** debounce delay (ms). 기본값 500 */
  delay?: number;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full 또는 unavailable — silent fail
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // unavailable — silent fail
  }
}

export function useDraftAutosave<T>(
  key: string,
  initialValue: T,
  options?: UseDraftAutosaveOptions,
): [
  value: T,
  setValue: React.Dispatch<React.SetStateAction<T>>,
  actions: { clear: () => void },
] {
  const delay = options?.delay ?? 500;

  const [value, setValue] = useState<T>(() => readStorage(key, initialValue));
  const latestRef = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestRef.current = value;
  });

  // debounce 저장
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      writeStorage(key, latestRef.current);
    }, delay);

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [key, value, delay]);

  // 언마운트·beforeunload 시 즉시 flush — 유실 방지
  useEffect(() => {
    const flush = () => writeStorage(key, latestRef.current);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      flush();
    };
  }, [key]);

  const clear = useCallback(() => {
    removeStorage(key);
    setValue(initialValue);
  }, [key, initialValue]);

  return [value, setValue, { clear }];
}

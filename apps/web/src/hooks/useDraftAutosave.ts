import { useCallback, useEffect, useRef, useState } from "react";

interface UseDraftAutosaveOptions {
  /** ms 단위 */
  delay?: number;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
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
  draft: T,
  setDraft: React.Dispatch<React.SetStateAction<T>>,
  actions: { clear: () => void },
] {
  const delay = options?.delay ?? 500;

  const [draft, setDraftState] = useState<T>(() =>
    readStorage(key, initialValue),
  );
  const initialValueRef = useRef(initialValue);
  const latestRef = useRef(draft);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const clearedRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(function syncLatestRef() {
    latestRef.current = draft;
  });

  useEffect(
    function scheduleAutosave() {
      if (clearedRef.current) {
        return;
      }

      timeoutRef.current = setTimeout(() => {
        writeStorage(key, latestRef.current);
      }, delay);

      return () => {
        clearTimeout(timeoutRef.current);
      };
    },
    [key, draft, delay],
  );

  // 언마운트·beforeunload 시 즉시 flush — 유실 방지
  useEffect(
    function flushOnUnmount() {
      const flush = () => {
        if (!clearedRef.current && dirtyRef.current) {
          writeStorage(key, latestRef.current);
        }
      };
      window.addEventListener("beforeunload", flush);
      return () => {
        window.removeEventListener("beforeunload", flush);
        clearTimeout(timeoutRef.current);
        flush();
      };
    },
    [key],
  );

  const setDraft = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (action) => {
      clearedRef.current = false;
      dirtyRef.current = true;
      setDraftState(action);
    },
    [],
  );

  const clear = useCallback(() => {
    clearedRef.current = true;
    dirtyRef.current = false;
    removeStorage(key);
    setDraftState(initialValueRef.current);
  }, [key]);

  return [draft, setDraft, { clear }];
}

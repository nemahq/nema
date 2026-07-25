import { useSyncExternalStore } from "react";

import { Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";

import { formatCompactDistance, type Lang } from "./relativeTimeFormat";

const TICK_INTERVAL_MS = 60_000;

let globalTick = 0;
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!intervalId) {
    intervalId = setInterval(() => {
      globalTick++;
      for (const fn of listeners) {
        fn();
      }
    }, TICK_INTERVAL_MS);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot(): number {
  return globalTick;
}

interface RelativeTimeProps {
  dateTime: string;
  className?: string;
}

export function RelativeTime({ dateTime, className }: RelativeTimeProps) {
  // useTranslation 구독 → 언어 변경 시 리렌더링 보장
  useTranslation();
  useSyncExternalStore(subscribe, getSnapshot);

  const lang: Lang = tolgee.getLanguage() === "ko" ? "ko" : "en";
  const label = formatCompactDistance(dateTime, lang);

  return (
    <Text
      as="time"
      dateTime={dateTime}
      size="xs"
      color="tertiary"
      className={className}
    >
      {label}
    </Text>
  );
}

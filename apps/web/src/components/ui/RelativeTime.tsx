import { useSyncExternalStore } from "react";

import { Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";

import { formatCompactDistance, type Lang } from "./relativeTimeFormat";

const TICK_INTERVAL_MS = 60_000;

let globalTick = 0;
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

// 다른 화면의 상대시각 표시(예: SaveStatusIndicator)도 분마다 다시 그려지려면
// 각자 setInterval을 새로 만들지 않고 이 전역 틱 하나를 구독하면 된다.
export function subscribeToMinuteTick(cb: () => void): () => void {
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

export function getMinuteTickSnapshot(): number {
  return globalTick;
}

interface RelativeTimeProps {
  dateTime: string;
  className?: string;
}

export function RelativeTime({ dateTime, className }: RelativeTimeProps) {
  // useTranslation 구독 → 언어 변경 시 리렌더링 보장
  useTranslation();
  useSyncExternalStore(subscribeToMinuteTick, getMinuteTickSnapshot);

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

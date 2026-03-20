import { formatDistanceToNow } from "date-fns";
import { enUS, ko } from "date-fns/locale";
import { useSyncExternalStore } from "react";

import { cn } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";

const LOCALE_MAP = { ko, en: enUS } as const;
const TICK_INTERVAL_MS = 60_000;

let globalTick = 0;
const listeners = new Set<() => void>();

setInterval(() => {
  globalTick++;
  for (const fn of listeners) {
    fn();
  }
}, TICK_INTERVAL_MS);

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
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

  const lang = tolgee.getLanguage() as keyof typeof LOCALE_MAP;
  const label = formatDistanceToNow(new Date(dateTime), {
    addSuffix: true,
    locale: LOCALE_MAP[lang] ?? ko,
  });

  return (
    <time
      dateTime={dateTime}
      className={cn("text-[11px] leading-[1.4] text-fg-tertiary", className)}
    >
      {label}
    </time>
  );
}

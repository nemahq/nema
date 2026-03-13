import { formatDistanceToNow } from "date-fns";
import { enUS, ko } from "date-fns/locale";
import { useEffect, useReducer } from "react";

import { cn } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";

const LOCALE_MAP = { ko, en: enUS } as const;
const TICK_INTERVAL_MS = 60_000;

export function RelativeTime({
  dateTime,
  className,
}: {
  dateTime: string;
  className?: string;
}) {
  // useTranslation 구독 → 언어 변경 시 리렌더링 보장
  useTranslation();
  const [, tick] = useReducer((c: number) => c + 1, 0);

  useEffect(function startMinuteTimer() {
    const id = setInterval(tick, TICK_INTERVAL_MS);
    return function cleanup() {
      clearInterval(id);
    };
  }, []);

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

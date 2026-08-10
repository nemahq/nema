import { useSyncExternalStore } from "react";

import { Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";

import {
  formatCompactDistance,
  getMinuteTickSnapshot,
  type Lang,
  subscribeToMinuteTick,
} from "./relativeTimeFormat";

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

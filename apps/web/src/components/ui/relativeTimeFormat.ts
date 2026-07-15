const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

// Linear·Notion·Vercel류 압축 표기("3h"/"3시간")를 따른다 — date-fns 기본
// 로케일 문구("about 3 hours ago"/"약 3시간 전")는 11px 캡션치곤 장황하다고 판단.
// "ago"/"전" 접미사까지 국문·영문 동일하게 뺀 최소 표현으로 통일한다.
const UNIT_SUFFIX = {
  en: { now: "now", minute: "m", hour: "h", day: "d", month: "mo", year: "y" },
  ko: {
    now: "방금",
    minute: "분",
    hour: "시간",
    day: "일",
    month: "개월",
    year: "년",
  },
} as const;

export type Lang = keyof typeof UNIT_SUFFIX;

const BUCKETS: Array<{
  maxMs: number;
  divisorMs: number;
  unitKey: keyof (typeof UNIT_SUFFIX)["en"];
}> = [
  { maxMs: HOUR_MS, divisorMs: MINUTE_MS, unitKey: "minute" },
  { maxMs: DAY_MS, divisorMs: HOUR_MS, unitKey: "hour" },
  { maxMs: MONTH_MS, divisorMs: DAY_MS, unitKey: "day" },
  { maxMs: YEAR_MS, divisorMs: MONTH_MS, unitKey: "month" },
];

export function formatCompactDistance(dateTime: string, lang: Lang): string {
  const elapsedMs = Date.now() - new Date(dateTime).getTime();
  const suffix = UNIT_SUFFIX[lang];

  if (elapsedMs < MINUTE_MS) {
    return suffix.now;
  }

  const bucket = BUCKETS.find((candidate) => elapsedMs < candidate.maxMs);
  const divisorMs = bucket?.divisorMs ?? YEAR_MS;
  const unit = bucket ? suffix[bucket.unitKey] : suffix.year;
  const unitCount = Math.floor(elapsedMs / divisorMs);

  return `${unitCount}${unit}`;
}

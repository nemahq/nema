import {
  isThisMonth,
  isThisWeek,
  isThisYear,
  isToday,
  isYesterday,
} from "date-fns";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "numeric",
  day: "numeric",
});

type WeekInfoLocale = Intl.Locale & {
  getWeekInfo?: () => { firstDay: number };
};

function getWeekStartsOn(): 0 | 1 {
  try {
    const locale = new Intl.Locale(navigator.language) as WeekInfoLocale;
    const info = locale.getWeekInfo?.();
    return info?.firstDay === 7 ? 0 : 1;
  } catch {
    return 1;
  }
}

const WEEK_STARTS_ON = getWeekStartsOn();

export type TimeGroup =
  | { kind: "today" | "yesterday" | "this_week" | "this_month" | "this_year" }
  | { kind: "year"; year: number };

export function formatHistoryTime(date: Date): string {
  if (isToday(date) || isYesterday(date)) {
    return timeFormatter.format(date);
  }
  return dateFormatter.format(date);
}

export function getTimeGroup(date: Date): TimeGroup {
  if (isToday(date)) {
    return { kind: "today" };
  }
  if (isYesterday(date)) {
    return { kind: "yesterday" };
  }
  if (isThisWeek(date, { weekStartsOn: WEEK_STARTS_ON })) {
    return { kind: "this_week" };
  }
  if (isThisMonth(date)) {
    return { kind: "this_month" };
  }
  if (isThisYear(date)) {
    return { kind: "this_year" };
  }
  return { kind: "year", year: date.getFullYear() };
}

export function timeGroupId(group: TimeGroup): string {
  return group.kind === "year" ? `year:${group.year}` : group.kind;
}

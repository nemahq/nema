import {
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  isThisMonth,
  isThisWeek,
  isThisYear,
  isToday,
  isYesterday,
} from "date-fns";
import { ko } from "date-fns/locale";

const ONE_MONTH_DAYS = 30;

export function formatHistoryTime(date: Date): string {
  const diffDays = differenceInCalendarDays(new Date(), date);

  if (diffDays < ONE_MONTH_DAYS) {
    return formatDistanceToNow(date, { addSuffix: true, locale: ko });
  }

  if (isThisYear(date)) {
    return format(date, "M. d.");
  }

  return format(date, "yyyy. M. d.");
}

export function formatHistoryTimeTooltip(date: Date): string {
  return format(date, "yyyy년 M월 d일 HH:mm", { locale: ko });
}

export function getTimeGroup(date: Date): string {
  if (isToday(date)) {
    return "오늘";
  }
  if (isYesterday(date)) {
    return "어제";
  }
  if (isThisWeek(date, { weekStartsOn: 1 })) {
    return "이번 주";
  }
  if (isThisMonth(date)) {
    return "이번 달";
  }
  if (isThisYear(date)) {
    return "올해";
  }
  return `${date.getFullYear()}년`;
}

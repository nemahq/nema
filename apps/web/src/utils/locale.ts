import { type Locale, LOCALES } from "@nema-io/shared";

import { getStorage } from "@web/utils/localStorage";

export function detectLanguage(): Locale {
  const stored = getStorage("locale");
  if (stored) {
    return stored;
  }

  const browserLang = navigator?.language?.split("-")[0];
  if ((LOCALES as readonly string[]).includes(browserLang ?? "")) {
    return browserLang as Locale;
  }
  return "ko";
}

type WeekInfoLocale = Intl.Locale & {
  getWeekInfo?: () => { firstDay: number };
};

// `Intl.Locale.getWeekInfo()` 미지원 환경(구 Safari/Firefox)에서 월요일로 fallback.
export function getWeekStartsOn(): 0 | 1 {
  try {
    const locale = new Intl.Locale(navigator.language) as WeekInfoLocale;
    const info = locale.getWeekInfo?.();
    return info?.firstDay === 7 ? 0 : 1;
  } catch {
    return 1;
  }
}

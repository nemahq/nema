import { setStorage } from "@web/lib/storage";

import { tolgee } from "./tolgee";
import type { Locale } from "./types";

export function changeLocale(locale: Locale) {
  // TODO: 에러 트래킹 도입 시 에러 리포팅 추가
  tolgee.changeLanguage(locale).then(
    () => setStorage("locale", locale),
    () => {},
  );
}

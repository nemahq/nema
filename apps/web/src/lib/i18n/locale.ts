import { setStorage } from "@web/lib/storage.js";

import { tolgee } from "./tolgee.js";
import type { Locale } from "./types.js";

export function changeLocale(locale: Locale) {
  // TODO: 에러 트래킹 도입 시 에러 리포팅 추가
  tolgee.changeLanguage(locale).then(
    () => setStorage("locale", locale),
    () => {},
  );
}

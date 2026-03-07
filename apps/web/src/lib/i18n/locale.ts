import type { Locale } from "./types.js";
import { tolgee } from "./tolgee.js";
import { setStorage } from "../storage.js";

// TODO: 번역 키 규모 증가 시 staticData → CDN fetch 전환
export function changeLocale(locale: Locale) {
  setStorage("locale", locale);
  // TODO: 에러 트래킹 도입 시 에러 리포팅 추가
  tolgee.changeLanguage(locale).catch(() => {});
}

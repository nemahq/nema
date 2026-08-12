import { z } from "zod";

// 서버 응답 메시지·클라이언트 UI가 함께 참조하는 지원 언어 집합.
export const LOCALES = ["ko", "en"] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}

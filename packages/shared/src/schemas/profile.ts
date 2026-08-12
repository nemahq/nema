import { z } from "zod";

// 콘텐츠 언어 — UI 언어(tolgee)와 별개로, 사람이 명시적으로 고르는 콘텐츠 관련 언어
// 설정. legacy 설계를 그대로 옮긴다(정리 프롬프트가 지금은 "원문과 같은 언어로
// 쓴다"라 이 값을 안 읽지만, 의도적으로 유지한다).
export const CONTENT_LANGUAGES = ["en", "ko"] as const;
export const ContentLanguageSchema = z.enum(CONTENT_LANGUAGES);
export type ContentLanguage = z.infer<typeof ContentLanguageSchema>;

export const ProfileSchema = z.object({
  contentLanguage: ContentLanguageSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileUpdateInputSchema = z.object({
  contentLanguage: ContentLanguageSchema,
});
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateInputSchema>;

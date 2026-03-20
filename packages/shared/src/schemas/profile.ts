import { z } from "zod";

export const CONTENT_LANGUAGES = ["en", "ko"] as const;

export const ContentLanguageSchema = z.enum(CONTENT_LANGUAGES);
export type ContentLanguage = z.infer<typeof ContentLanguageSchema>;

export const ProfileSchema = z.object({
  contentLanguage: ContentLanguageSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileUpdateInputSchema = z.object({
  contentLanguage: ContentLanguageSchema,
});
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateInputSchema>;

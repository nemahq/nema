import { z } from "zod";

export const TAG_TITLE_MAX_LENGTH = 50;
// Tag는 추상적 방법론 분류라 재사용 판단 기준이 될 정의가 필수다(07-modeling Tag) —
// 빈 정의를 허용하면 Topic과 구분이 사라진다.
export const TAG_DESCRIPTION_MAX_LENGTH = 500;

export const TagDraftSchema = z.object({
  title: z.string().trim().min(1).max(TAG_TITLE_MAX_LENGTH),
  description: z.string().trim().min(1).max(TAG_DESCRIPTION_MAX_LENGTH),
});
export type TagDraft = z.infer<typeof TagDraftSchema>;

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

// DB enum tag_status의 SSOT (07-modeling Tag).
export const TAG_STATUSES = ["active", "archived"] as const;
export const TagStatusSchema = z.enum(TAG_STATUSES);
export type TagStatus = z.infer<typeof TagStatusSchema>;

// DB enum tag_color의 SSOT — weave TagColor(Chip.tsx)와 값이 같아야 한다(AA 대비
// 검증된 8종을 그대로 재사용, 새 팔레트를 따로 만들지 않는다).
export const TAG_COLORS = [
  "sienna",
  "cyan",
  "sage",
  "olive",
  "terracotta",
  "rose",
  "mauve",
  "violet",
] as const;
export const TagColorSchema = z.enum(TAG_COLORS);
export type TagColor = z.infer<typeof TagColorSchema>;

export const TagSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  color: TagColorSchema,
  status: TagStatusSchema,
  // Postgres timestamptz는 +00:00 offset을 달고 오므로 offset 허용이 필수.
  createdAt: z.string().datetime({ offset: true }),
});
export type Tag = z.infer<typeof TagSchema>;

// active=기본 조회, archived=복구 대상, all=둘 다.
export const TAG_LIST_SCOPES = ["active", "archived", "all"] as const;
export const TagListScopeSchema = z.enum(TAG_LIST_SCOPES).default("active");
export type TagListScope = z.infer<typeof TagListScopeSchema>;

export const TagListInputSchema = z
  .object({ scope: TagListScopeSchema })
  .default({ scope: "active" });
export type TagListInput = z.infer<typeof TagListInputSchema>;

export const TagUpdateInputSchema = TagDraftSchema.extend({
  id: z.string().uuid(),
});
export type TagUpdateInput = z.infer<typeof TagUpdateInputSchema>;

export const TagIdInputSchema = z.object({ id: z.string().uuid() });
export type TagIdInput = z.infer<typeof TagIdInputSchema>;

import { z } from "zod";

export const TOPIC_NAME_MAX_LENGTH = 50;

// DB enum topic_status의 SSOT (browsing-flow.md Topic 아카이브/되살리기).
export const TOPIC_STATUSES = ["active", "archived"] as const;
export const TopicStatusSchema = z.enum(TOPIC_STATUSES);
export type TopicStatus = z.infer<typeof TopicStatusSchema>;

// 주제 레지스트리 항목 = 지도의 줄기 하나.
export const TopicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: TopicStatusSchema,
});
export type Topic = z.infer<typeof TopicSchema>;

export const TopicUpdateInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(TOPIC_NAME_MAX_LENGTH),
});
export type TopicUpdateInput = z.infer<typeof TopicUpdateInputSchema>;

export const TopicIdInputSchema = z.object({ id: z.string().uuid() });
export type TopicIdInput = z.infer<typeof TopicIdInputSchema>;

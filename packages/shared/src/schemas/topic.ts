import { z } from "zod";

export const TOPIC_NAME_MAX_LENGTH = 50;

// 주제 레지스트리 항목 = 지도의 줄기 하나.
export const TopicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type Topic = z.infer<typeof TopicSchema>;

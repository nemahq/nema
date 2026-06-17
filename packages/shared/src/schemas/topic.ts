import { z } from "zod";

export const TOPIC_NAME_MAX_LENGTH = 50;
// 멀티 라벨 보수적 상한 — 평소 1개, 명확히 다주제일 때만 여러 개. 군집화 방지.
export const DRAFT_TOPICS_MAX = 5;

// 주제 레지스트리 항목 = 지도의 줄기 하나.
export const TopicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type Topic = z.infer<typeof TopicSchema>;

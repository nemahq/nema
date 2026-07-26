import { z } from "zod";

export const TOPIC_NAME_MAX_LENGTH = 50;

// DB enum topic_status의 SSOT (browsing-flow.md Topic 아카이브/되살리기).
export const TOPIC_STATUSES = ["active", "archived"] as const;
export const TopicStatusSchema = z.enum(TOPIC_STATUSES);
export type TopicStatus = z.infer<typeof TopicStatusSchema>;

// 주제 레지스트리 항목 = 지도의 스레드 하나.
export const TopicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: TopicStatusSchema,
});
export type Topic = z.infer<typeof TopicSchema>;

// spaceId 미지정 = 워크스페이스 전역(모든 소속 Space) 목록 — Topic 관리 화면처럼
// Space를 가로질러 훑어보는 화면용. 지정 시 그 Space로만 좁혀 반환한다 — Digest 리뷰의
// "기존 Topic 검색"처럼 다른 Space의 동명 Topic을 오재사용하면 안 되는 화면이 쓴다.
export const TopicListInputSchema = z
  .object({ spaceId: z.string().uuid().optional() })
  .default({});
export type TopicListInput = z.infer<typeof TopicListInputSchema>;

export const TopicUpdateInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(TOPIC_NAME_MAX_LENGTH),
});
export type TopicUpdateInput = z.infer<typeof TopicUpdateInputSchema>;

export const TopicIdInputSchema = z.object({ id: z.string().uuid() });
export type TopicIdInput = z.infer<typeof TopicIdInputSchema>;

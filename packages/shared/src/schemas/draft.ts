import { z } from "zod";

import { SOURCE_BODY_MAX_LENGTH } from "./source";
import { DRAFT_TOPICS_MAX, TOPIC_NAME_MAX_LENGTH } from "./topic";

export const DraftOriginSchema = z.enum(["in_app", "external"]);
export type DraftOrigin = z.infer<typeof DraftOriginSchema>;

export const DRAFT_TITLE_MAX_LENGTH = 100;

// 확정 직전 대기 자리. 두 입구가 공유하고 사람·MCP가 공동 편집한다.
export const DraftSchema = z.object({
  id: z.string().uuid(),
  origin: DraftOriginSchema,
  title: z.string().nullable(),
  body: z.string(),
  proposedTopics: z.array(z.string()).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Draft = z.infer<typeof DraftSchema>;

const TopicNameArray = z
  .array(z.string().trim().min(1).max(TOPIC_NAME_MAX_LENGTH))
  .max(DRAFT_TOPICS_MAX);

// 앱·외부(MCP) 한 방 어시스턴트 입력 (거친 말뭉치). 결과는 {title, body, topics} 초안.
// origin은 입구 구분 — 앱은 기본 in_app, MCP 도구가 external을 주입한다.
export const DraftAssistInputSchema = z.object({
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH),
  origin: DraftOriginSchema.default("in_app"),
});
export type DraftAssistInput = z.infer<typeof DraftAssistInputSchema>;

// 생성 (앱 어시스턴트 결과 + MCP 새 초안). 갱신은 DraftEditInput(부분)로 — create와
// update를 한 입력에 겹치면 update 분기가 body를 강제해 부분 갱신이 막힌다.
export const DraftCreateInputSchema = z.object({
  origin: DraftOriginSchema,
  title: z.string().trim().max(DRAFT_TITLE_MAX_LENGTH).optional(),
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH),
  proposedTopics: TopicNameArray.default([]),
});
export type DraftCreateInput = z.infer<typeof DraftCreateInputSchema>;

// 공동 편집 (사람 수정 + MCP 기존 초안 지목). 부분 갱신: 빠진 필드는 기존값 유지.
export const DraftEditInputSchema = z.object({
  draftId: z.string().uuid(),
  title: z.string().trim().max(DRAFT_TITLE_MAX_LENGTH).optional(),
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH).optional(),
  proposedTopics: TopicNameArray.optional(),
});
export type DraftEditInput = z.infer<typeof DraftEditInputSchema>;

// 확정 게이트. topics는 0개 허용 = 무태그(미분류). 강제하지 않는다.
export const DraftConfirmInputSchema = z.object({
  draftId: z.string().uuid(),
  title: z.string().trim().min(1).max(DRAFT_TITLE_MAX_LENGTH),
  topics: TopicNameArray,
});
export type DraftConfirmInput = z.infer<typeof DraftConfirmInputSchema>;

export const DraftGetInputSchema = z.object({
  draftId: z.string().uuid(),
});
export type DraftGetInput = z.infer<typeof DraftGetInputSchema>;

export const DraftDeleteInputSchema = z.object({
  draftId: z.string().uuid(),
});
export type DraftDeleteInput = z.infer<typeof DraftDeleteInputSchema>;

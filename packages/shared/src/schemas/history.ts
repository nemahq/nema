import { z } from "zod";

export const HISTORY_LIST_DEFAULT_LIMIT = 20;
export const HISTORY_LIST_MAX_LIMIT = 100;

/**
 * History 단위로 집계된 정리 상태.
 * Revision 상태(pending/completed/failed, 향후 processing 추가 가능)를
 * History 레벨 단일 신호로 환원한다.
 *
 * 집계 규칙:
 * - processing: 하나라도 진행 중(pending/processing) — 실패 확정 보류
 * - failed: 진행 중 없음 + 하나라도 failed (mixed completed/failed 포함)
 * - completed: 전부 completed
 *
 * pending을 별도 상태로 두지 않은 건 의도적 — History 레벨에선
 * "뭐가 돌고 있다"를 단일 신호(processing)로 합친다.
 */
export const HistoryStatusSchema = z.enum([
  "processing",
  "completed",
  "failed",
]);
export type HistoryStatus = z.infer<typeof HistoryStatusSchema>;

export const RevisionIngestionStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);
export type RevisionIngestionStatus = z.infer<
  typeof RevisionIngestionStatusSchema
>;

export const UpdateTypeSchema = z.enum(["create", "extend", "replace"]);
export type UpdateType = z.infer<typeof UpdateTypeSchema>;

export const RevisionSourceSchema = z.enum(["direct", "propagated"]);
export type RevisionSource = z.infer<typeof RevisionSourceSchema>;

/**
 * Memory 삭제 상태를 타입으로 강제.
 * - active: id·name 모두 존재
 * - deleted: id 없음, name은 스냅샷으로 유지
 */
export const RevisionMemorySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("active"),
    id: z.string().uuid(),
    name: z.string(),
  }),
  z.object({
    status: z.literal("deleted"),
    name: z.string(),
  }),
]);
export type RevisionMemory = z.infer<typeof RevisionMemorySchema>;

export const HistoryListItemSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  primaryMemory: z.object({
    id: z.string().uuid(),
    // 제목이 아직 안 정해진 상태(ingestion pending 등)를 null로 전달 — fallback 표시는 프론트 책임
    name: z.string().nullable(),
  }),
  memoryCount: z.number().int().nonnegative(),
  sessionId: z.string().uuid().nullable(),
  status: HistoryStatusSchema,
});
export type HistoryListItem = z.infer<typeof HistoryListItemSchema>;

export const HistoryListInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(HISTORY_LIST_MAX_LIMIT)
    .default(HISTORY_LIST_DEFAULT_LIMIT),
});
export type HistoryListInput = z.infer<typeof HistoryListInputSchema>;

export const HistoryListOutputSchema = z.object({
  items: z.array(HistoryListItemSchema),
  nextCursor: z.string().nullable(),
});
export type HistoryListOutput = z.infer<typeof HistoryListOutputSchema>;

/**
 * updateType과 prevBody의 교차 불변식을 타입으로 강제.
 * DB CHECK 제약(chk_create_has_null_prev)과 일치:
 * - create → prevBody null
 * - extend/replace → prevBody 필수
 */
const RevisionBaseSchema = z.object({
  id: z.string().uuid(),
  memory: RevisionMemorySchema,
  nextBody: z.string(),
  source: RevisionSourceSchema,
  ingestionStatus: RevisionIngestionStatusSchema,
});

export const HistoryRevisionSchema = z.discriminatedUnion("updateType", [
  RevisionBaseSchema.extend({
    updateType: z.literal("create"),
    prevBody: z.null(),
  }),
  RevisionBaseSchema.extend({
    updateType: z.literal("extend"),
    prevBody: z.string(),
  }),
  RevisionBaseSchema.extend({
    updateType: z.literal("replace"),
    prevBody: z.string(),
  }),
]);
export type HistoryRevision = z.infer<typeof HistoryRevisionSchema>;

export const HistoryDetailInputSchema = z.object({
  historyId: z.string().uuid(),
});
export type HistoryDetailInput = z.infer<typeof HistoryDetailInputSchema>;

export const HistoryDetailOutputSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  sessionId: z.string().uuid().nullable(),
  status: HistoryStatusSchema,
  revisions: z.array(HistoryRevisionSchema),
});
export type HistoryDetailOutput = z.infer<typeof HistoryDetailOutputSchema>;

export const RetryHistoryIngestionInputSchema = z.object({
  historyId: z.string().uuid(),
});
export type RetryHistoryIngestionInput = z.infer<
  typeof RetryHistoryIngestionInputSchema
>;

export const HistoryStatusEventSchema = z.object({
  historyId: z.string().uuid(),
  status: HistoryStatusSchema,
});
export type HistoryStatusEvent = z.infer<typeof HistoryStatusEventSchema>;

export const HistoryStatusSubscriptionInputSchema = z.object({
  historyIds: z.array(z.string().uuid()),
});
export type HistoryStatusSubscriptionInput = z.infer<
  typeof HistoryStatusSubscriptionInputSchema
>;

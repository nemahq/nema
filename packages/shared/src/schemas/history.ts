import { z } from "zod";

export const HISTORY_LIST_MAX_LIMIT = 50;

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

const HistorySessionRefSchema = z
  .object({
    id: z.string().uuid(),
  })
  .nullable();

export const HistoryListItemSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  primaryMemory: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  memoryCount: z.number().int().nonnegative(),
  session: HistorySessionRefSchema,
  status: HistoryStatusSchema,
});
export type HistoryListItem = z.infer<typeof HistoryListItemSchema>;

export const HistoryListInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(HISTORY_LIST_MAX_LIMIT).optional(),
});
export type HistoryListInput = z.infer<typeof HistoryListInputSchema>;

export const HistoryListOutputSchema = z.object({
  items: z.array(HistoryListItemSchema),
  nextCursor: z.string().nullable(),
});
export type HistoryListOutput = z.infer<typeof HistoryListOutputSchema>;

export const HistoryRevisionSchema = z.object({
  id: z.string().uuid(),
  memory: z.object({
    id: z.string().uuid().nullable(),
    name: z.string(),
  }),
  prevBody: z.string().nullable(),
  nextBody: z.string(),
  updateType: UpdateTypeSchema,
  source: RevisionSourceSchema,
  ingestionStatus: RevisionIngestionStatusSchema,
});
export type HistoryRevision = z.infer<typeof HistoryRevisionSchema>;

export const HistoryDetailInputSchema = z.object({
  id: z.string().uuid(),
});
export type HistoryDetailInput = z.infer<typeof HistoryDetailInputSchema>;

export const HistoryDetailOutputSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  session: HistorySessionRefSchema,
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

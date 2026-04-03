import { z } from "zod";

import { SearchResultDocSchema } from "./chat-stream";

export const SessionSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type SessionListInput = z.infer<typeof SessionListInputSchema>;

export const SessionDeleteInputSchema = z.object({
  sessionId: z.string().uuid(),
});

export type SessionDeleteInput = z.infer<typeof SessionDeleteInputSchema>;

export const SessionDraftSchema = z.object({
  body: z.string().min(1),
});
export type SessionDraft = z.infer<typeof SessionDraftSchema>;

export const SessionRetrievalSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  query: z.string().min(1),
  body: z.string().min(1),
  documents: z.array(SearchResultDocSchema).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type SessionRetrieval = z.infer<typeof SessionRetrievalSchema>;

export const DeleteRetrievalInputSchema = z.object({
  retrievalId: z.string().uuid(),
});
export type DeleteRetrievalInput = z.infer<typeof DeleteRetrievalInputSchema>;

export const SessionGetInputSchema = z.object({
  sessionId: z.string().uuid(),
});
export type SessionGetInput = z.infer<typeof SessionGetInputSchema>;

export const SESSION_TITLE_MAX_LENGTH = 100;

export const SessionUpdateInputSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().trim().min(1).max(SESSION_TITLE_MAX_LENGTH),
});
export type SessionUpdateInput = z.infer<typeof SessionUpdateInputSchema>;

export const SessionCreateInputSchema = z.object({
  sessionId: z.string().uuid(),
});
export type SessionCreateInput = z.infer<typeof SessionCreateInputSchema>;

export const SessionGenerateTitleInputSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1),
});
export type SessionGenerateTitleInput = z.infer<
  typeof SessionGenerateTitleInputSchema
>;

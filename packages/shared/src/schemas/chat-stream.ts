import { z } from "zod";

const PHASE_VALUES = ["searching", "answering"] as const;

export const PhaseNameSchema = z.enum(PHASE_VALUES);
export type PhaseName = z.infer<typeof PhaseNameSchema>;

export const SearchResultDocSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export type SearchResultDoc = z.infer<typeof SearchResultDocSchema>;

export const ChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string().min(1) }),
  z.object({ type: z.literal("draft_start") }),
  z.object({ type: z.literal("retrieval_start") }),
  z.object({
    type: z.literal("draft_intent_confirmation"),
    actionMessageId: z.string().uuid(),
    draftContext: z.string(),
  }),
  z.object({ type: z.literal("phase"), name: PhaseNameSchema }),
  z.object({
    type: z.literal("search_query"),
    queries: z.array(z.string()),
    entities: z.array(z.string()),
  }),
  z.object({
    type: z.literal("search_results"),
    documents: z.array(SearchResultDocSchema),
  }),
  z.object({
    type: z.literal("retrieval_saved"),
    retrievalId: z.string().uuid(),
  }),
  z.object({ type: z.literal("done") }),
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

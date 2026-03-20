import { z } from "zod";

const PHASE_VALUES = ["searching"] as const;

export const PhaseNameSchema = z.enum(PHASE_VALUES);
export type PhaseName = z.infer<typeof PhaseNameSchema>;

export const ChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string().min(1) }),
  z.object({ type: z.literal("draft_start") }),
  z.object({ type: z.literal("retrieval_start") }),
  z.object({ type: z.literal("phase"), name: PhaseNameSchema }),
  z.object({ type: z.literal("done") }),
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

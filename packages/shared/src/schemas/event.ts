import { z } from "zod";

export const TrackEventInputSchema = z.object({
  sessionId: z.string().uuid().nullable(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type TrackEventInput = z.infer<typeof TrackEventInputSchema>;

import { z } from "zod";

export const SourceCreateInputSchema = z.object({
  body: z.string().trim().min(1),
  sessionId: z.string().uuid().optional(),
});

export type SourceCreateInput = z.infer<typeof SourceCreateInputSchema>;

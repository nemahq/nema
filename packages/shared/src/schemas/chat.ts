import { z } from "zod";

export const ChatInputSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().trim().min(1).max(100_000),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

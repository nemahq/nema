import { z } from "zod";

export const ChatInputSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

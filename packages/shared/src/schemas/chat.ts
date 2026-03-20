import { z } from "zod";

export const CHAT_MODES = ["remember", "ask"] as const;
export const ChatModeSchema = z.enum(CHAT_MODES);
export type ChatMode = z.infer<typeof ChatModeSchema>;

export const ChatInputSchema = z.object({
  sessionId: z.string().uuid(),
  messageId: z.string().uuid(),
  content: z.string().trim().min(1).max(100_000),
  mode: ChatModeSchema,
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

export const DraftActionInputSchema = z.object({
  sessionId: z.string().uuid(),
});
export type DraftActionInput = z.infer<typeof DraftActionInputSchema>;

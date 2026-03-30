import { z } from "zod";

export const CHAT_MODES = ["remember", "ask"] as const;
export const ChatModeSchema = z.enum(CHAT_MODES);
export type ChatMode = z.infer<typeof ChatModeSchema>;

const ChatStartInputSchema = z.object({
  type: z.literal("start"),
  sessionId: z.string().uuid(),
  messageId: z.string().uuid(),
  content: z.string().trim().min(1).max(100_000),
  mode: ChatModeSchema,
});

const ChatResumeInputSchema = z.object({
  type: z.literal("resume"),
  sessionId: z.string().uuid(),
});

export const ChatInputSchema = z.discriminatedUnion("type", [
  ChatStartInputSchema,
  ChatResumeInputSchema,
]);
export type ChatInput = z.infer<typeof ChatInputSchema>;
export type ChatStartInput = z.infer<typeof ChatStartInputSchema>;
export type ChatResumeInput = z.infer<typeof ChatResumeInputSchema>;

export const DraftActionInputSchema = z.object({
  sessionId: z.string().uuid(),
});
export type DraftActionInput = z.infer<typeof DraftActionInputSchema>;

import { z } from "zod";

export const MessageRoleSchema = z.enum(["user", "assistant"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageTypeSchema = z.enum(["text"]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: MessageRoleSchema,
  type: MessageTypeSchema,
  content: z.string(),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

export const SendMessageInputSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1),
  type: MessageTypeSchema.default("text"),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const GetMessagesInputSchema = z.object({
  sessionId: z.string().uuid(),
});
export type GetMessagesInput = z.infer<typeof GetMessagesInputSchema>;

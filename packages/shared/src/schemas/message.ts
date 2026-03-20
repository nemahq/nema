import { z } from "zod";

export const MessageRoleSchema = z.enum(["user", "assistant"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageTypeSchema = z.enum(["text", "draft", "status"]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

const STATUS_LOG_TYPE_VALUES = [
  "draft_creating",
  "draft_created",
  "draft_edited",
  "draft_cancelled",
] as const;

export const StatusLogTypeSchema = z.enum(STATUS_LOG_TYPE_VALUES);
export type StatusLogType = z.infer<typeof StatusLogTypeSchema>;

export const STATUS_LOG_TYPES = {
  DRAFT_CREATING: "draft_creating",
  DRAFT_CREATED: "draft_created",
  DRAFT_EDITED: "draft_edited",
  DRAFT_CANCELLED: "draft_cancelled",
} as const satisfies Record<string, StatusLogType>;

const BaseMessageSchema = z.object({
  id: z.string().uuid(),
  role: MessageRoleSchema,
  createdAt: z.string().datetime(),
});

export const MessageSchema = z.discriminatedUnion("type", [
  BaseMessageSchema.extend({ type: z.literal("text"), content: z.string() }),
  BaseMessageSchema.extend({ type: z.literal("draft"), content: z.string() }),
  BaseMessageSchema.extend({
    type: z.literal("status"),
    content: StatusLogTypeSchema,
  }),
]);
export type Message = z.infer<typeof MessageSchema>;

export const SendMessageInputSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().trim().min(1).max(100_000),
  type: z.enum(["text"]).default("text"),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const GetMessagesInputSchema = z.object({
  sessionId: z.string().uuid(),
});
export type GetMessagesInput = z.infer<typeof GetMessagesInputSchema>;

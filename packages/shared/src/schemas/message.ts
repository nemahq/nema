import { z } from "zod";

export const MessageRoleSchema = z.enum(["user", "assistant"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageTypeSchema = z.enum([
  "text",
  "draft",
  "status",
  "action",
  "retrieval",
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

const STATUS_LOG_TYPE_VALUES = [
  "draft_creating",
  "draft_created",
  "draft_edited",
  "draft_cancelled",
  "draft_saved",
  "draft_intent_confirmed",
  "retrieval_answered",
] as const;

export const StatusLogTypeSchema = z.enum(STATUS_LOG_TYPE_VALUES);
export type StatusLogType = z.infer<typeof StatusLogTypeSchema>;

export const STATUS_LOG_TYPES = {
  DRAFT_CREATING: "draft_creating",
  DRAFT_CREATED: "draft_created",
  DRAFT_EDITED: "draft_edited",
  DRAFT_CANCELLED: "draft_cancelled",
  DRAFT_SAVED: "draft_saved",
  DRAFT_INTENT_CONFIRMED: "draft_intent_confirmed",
  RETRIEVAL_ANSWERED: "retrieval_answered",
} as const satisfies Record<string, StatusLogType>;

export const DraftIntentOptionSchema = z.enum(["append", "replace"]);
export type DraftIntentOption = z.infer<typeof DraftIntentOptionSchema>;

const DraftIntentConfirmationPayloadSchema = z.object({
  actionType: z.literal("draft_intent_confirmation"),
  draftContext: z.string(),
  status: z.enum(["pending", "resolved"]),
  selectedOption: DraftIntentOptionSchema.nullable(),
});

const ActionPayloadSchema = z.discriminatedUnion("actionType", [
  DraftIntentConfirmationPayloadSchema,
]);
export type ActionPayload = z.infer<typeof ActionPayloadSchema>;

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
    meta: z.object({ titles: z.string() }).optional(),
  }),
  BaseMessageSchema.extend({
    type: z.literal("action"),
    content: z.string(),
    payload: ActionPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("retrieval"),
    content: z.string(),
    retrievalId: z.string().uuid(),
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

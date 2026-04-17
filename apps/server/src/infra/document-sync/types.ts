import { z } from "zod";

// --- PGMQ 메시지 스키마 (경량 트리거 + delete 이벤트) ---

const NotifyEventSchema = z.object({ type: z.literal("notify") });

const DeleteEventSchema = z.object({
  type: z.literal("document.deleted"),
  docId: z.string().uuid(),
});

const SyncEventSchema = z.discriminatedUnion("type", [
  NotifyEventSchema,
  DeleteEventSchema,
]);

export const TriggerMessageSchema = z.object({
  msg_id: z.number(),
  read_ct: z.number(),
  message: SyncEventSchema,
});

// --- TypeScript types ---

export type NotifyEvent = z.infer<typeof NotifyEventSchema>;

export interface DeleteEvent {
  type: "document.deleted";
  docId: string;
}

export type SyncEvent = NotifyEvent | DeleteEvent;

export interface TriggerMessage {
  msg_id: number;
  read_ct: number;
  message: SyncEvent;
}

export const PendingDocumentSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  body: z.string().min(1),
  tags: z.array(z.string()),
  summary: z.string(),
  created_at: z.string().datetime({ offset: true }),
});

export type PendingDocument = z.infer<typeof PendingDocumentSchema>;

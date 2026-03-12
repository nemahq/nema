import { z } from "zod";

import type { GraphEntity } from "@server/infra/graph";
import { ENTITY_TYPES } from "@server/infra/graph";

// --- Zod schemas for pgmq trust boundary validation ---

const GraphEntitySchema = z.object({
  type: z.enum(ENTITY_TYPES),
  name: z.string().min(1),
});

const DocumentPayloadSchema = z.object({
  docId: z.string(),
  userId: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
  entities: z.array(GraphEntitySchema),
});

const DocumentSyncEventSchema = z.discriminatedUnion("type", [
  DocumentPayloadSchema.extend({ type: z.literal("document.created") }),
  DocumentPayloadSchema.extend({ type: z.literal("document.updated") }),
  z.object({ type: z.literal("document.deleted"), docId: z.string() }),
]);

export const SyncMessageSchema = z.object({
  msg_id: z.union([z.string(), z.number()]),
  read_ct: z.number(),
  message: DocumentSyncEventSchema,
});

// --- TypeScript types ---

interface DocumentEventPayload {
  docId: string;
  userId: string;
  body: string;
  tags: string[];
  summary: string;
  entities: GraphEntity[];
}

export interface DocumentCreatedEvent extends DocumentEventPayload {
  type: "document.created";
}

export interface DocumentUpdatedEvent extends DocumentEventPayload {
  type: "document.updated";
}

export interface DocumentDeletedEvent {
  type: "document.deleted";
  docId: string;
}

export type DocumentSyncEvent =
  | DocumentCreatedEvent
  | DocumentUpdatedEvent
  | DocumentDeletedEvent;

export interface SyncMessage {
  msg_id: number | string;
  read_ct: number;
  message: DocumentSyncEvent;
}

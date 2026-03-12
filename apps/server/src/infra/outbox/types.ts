import type { GraphEntity } from "@server/infra/graph/graph-store";

export interface DocumentCreatedEvent {
  type: "document.created";
  docId: string;
  userId: string;
  body: string;
  tags: string[];
  summary: string;
  entities: GraphEntity[];
}

export interface DocumentUpdatedEvent {
  type: "document.updated";
  docId: string;
  userId: string;
  body: string;
  tags: string[];
  summary: string;
  entities: GraphEntity[];
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
  msg_id: number;
  read_ct: number;
  message: DocumentSyncEvent;
}

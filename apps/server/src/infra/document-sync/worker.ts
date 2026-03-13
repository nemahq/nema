import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import type { VectorStore } from "@server/infra/vector";

import type { DocumentSyncEvent, SyncMessage } from "./types";
import { SyncMessageSchema } from "./types";

const MAX_RETRIES = 5;
const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 5;
const VISIBILITY_TIMEOUT_SEC = 60;

interface WorkerDeps {
  supabase: SupabaseClient;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
  graphStore: GraphStore;
}

export function createSyncWorker(deps: WorkerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let processing = false;
  let currentPoll: Promise<void> | null = null;

  async function poll(): Promise<void> {
    if (processing) {
      return;
    }
    processing = true;

    try {
      const { data, error } = await deps.supabase.rpc("read_sync_events", {
        p_batch_size: BATCH_SIZE,
        p_visibility_timeout: VISIBILITY_TIMEOUT_SEC,
      });

      if (error) {
        console.error("[sync-worker] read error:", error);
        return;
      }
      if (!data || (data as unknown[]).length === 0) {
        return;
      }

      const parsed = z.array(SyncMessageSchema).safeParse(data);
      if (!parsed.success) {
        console.error("[sync-worker] message validation failed:", parsed.error);
        return;
      }

      for (const row of parsed.data as SyncMessage[]) {
        await handleMessage(row, deps);
      }
    } catch (err) {
      console.error("[sync-worker] poll error:", err);
    } finally {
      processing = false;
    }
  }

  return {
    start() {
      console.log("[sync-worker] started");
      timer = setInterval(() => {
        currentPoll = poll();
      }, POLL_INTERVAL_MS);
      currentPoll = poll();
    },

    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (currentPoll) {
        await currentPoll;
      }
      console.log("[sync-worker] stopped");
    },
  };
}

async function handleMessage(
  row: SyncMessage,
  deps: WorkerDeps,
): Promise<void> {
  const event = row.message;
  const docId = event.type !== "document.deleted" ? event.docId : undefined;

  try {
    await processEvent(event, deps);
  } catch (err) {
    console.error(
      `[sync-worker] failed to process ${event.type} (attempt ${row.read_ct}):`,
      err,
    );

    if (row.read_ct >= MAX_RETRIES) {
      try {
        await deps.supabase.rpc("nack_sync_event", {
          p_msg_id: row.msg_id,
          p_doc_id: docId ?? null,
        });
      } catch (nackErr) {
        console.error(
          `[sync-worker] nack failed for msg_id=${row.msg_id}:`,
          nackErr,
        );
      }

      console.error(
        `[sync-worker] permanently failed ${event.type} for doc ${
          "docId" in event ? event.docId : "unknown"
        }`,
      );
    }
    return;
  }

  try {
    await deps.supabase.rpc("ack_sync_event", {
      p_msg_id: row.msg_id,
      p_doc_id: docId ?? null,
    });
  } catch (ackErr) {
    console.error(
      `[sync-worker] ack failed for msg_id=${row.msg_id} (event already processed, may cause duplicate on retry):`,
      ackErr,
    );
  }
}

function assertNever(x: never): never {
  throw new Error(`Unexpected event type: ${JSON.stringify(x)}`);
}

async function processEvent(
  event: DocumentSyncEvent,
  deps: WorkerDeps,
): Promise<void> {
  const { embedding, vectorStore, graphStore } = deps;

  switch (event.type) {
    case "document.created": {
      await Promise.all([
        vectorStore.upsert(embedding, {
          docId: event.docId,
          userId: event.userId,
          chunks: [event.body],
          tags: event.tags,
          summary: event.summary,
        }),
        graphStore.upsertEntities({
          docId: event.docId,
          userId: event.userId,
          entities: event.entities,
        }),
      ]);
      break;
    }

    case "document.updated": {
      await vectorStore.deleteByDocument(event.docId);
      await graphStore.deleteByDocument(event.docId);

      await Promise.all([
        vectorStore.upsert(embedding, {
          docId: event.docId,
          userId: event.userId,
          chunks: [event.body],
          tags: event.tags,
          summary: event.summary,
        }),
        graphStore.upsertEntities({
          docId: event.docId,
          userId: event.userId,
          entities: event.entities,
        }),
      ]);
      break;
    }

    case "document.deleted": {
      await vectorStore.deleteByDocument(event.docId);
      await graphStore.deleteByDocument(event.docId);
      break;
    }

    default:
      assertNever(event);
  }
}

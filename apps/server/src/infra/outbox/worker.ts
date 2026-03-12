import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import type { VectorStore } from "@server/infra/vector";

import type { DocumentSyncEvent, SyncMessage } from "./types";

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

  async function poll(): Promise<void> {
    if (processing) return;
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
      if (!data || (data as SyncMessage[]).length === 0) return;

      for (const row of data as SyncMessage[]) {
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
      timer = setInterval(poll, POLL_INTERVAL_MS);
      poll();
    },

    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
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

  try {
    await processEvent(event, deps);

    const docId = event.type !== "document.deleted" ? event.docId : undefined;

    await deps.supabase.rpc("ack_sync_event", {
      p_msg_id: row.msg_id,
      p_doc_id: docId ?? null,
    });
  } catch (err) {
    console.error(
      `[sync-worker] failed to process ${event.type} (attempt ${row.read_ct}):`,
      err,
    );

    if (row.read_ct >= MAX_RETRIES) {
      const docId = event.type !== "document.deleted" ? event.docId : undefined;

      await deps.supabase.rpc("nack_sync_event", {
        p_msg_id: row.msg_id,
        p_doc_id: docId ?? null,
      });

      console.error(
        `[sync-worker] permanently failed ${event.type} for doc ${
          "docId" in event ? event.docId : "unknown"
        }`,
      );
    }
    // Otherwise: message becomes visible again after visibility timeout
  }
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
      // Delete old indices, then create new ones
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
  }
}

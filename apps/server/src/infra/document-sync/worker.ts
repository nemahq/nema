import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { VectorStore } from "@server/infra/vector";
import {
  buildEntityExtractionMessage,
  ENTITY_EXTRACTION_SYSTEM_PROMPT,
  EntityExtractionSchema,
} from "@server/prompts/entity-extraction";

import type { DeleteEvent, PendingDocument } from "./types";
import { PendingDocumentSchema, TriggerMessageSchema } from "./types";

const MAX_RETRIES = 5;
const POLL_INTERVAL_MS = 2_000;
const PGMQ_BATCH_SIZE = 10;
const VISIBILITY_TIMEOUT_SEC = 60;

interface WorkerDeps {
  supabase: SupabaseClient;
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
  graphStore: GraphStore;
}

export function createSyncWorker(deps: WorkerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let processing = false;
  let currentPoll: Promise<void> | null = null;

  async function poll(): Promise<void> {
    if (processing) return;
    processing = true;

    try {
      const { data, error } = await deps.supabase.rpc("read_sync_events", {
        p_batch_size: PGMQ_BATCH_SIZE,
        p_visibility_timeout: VISIBILITY_TIMEOUT_SEC,
      });

      if (error) {
        console.error("[sync-worker] read error:", error);
        return;
      }
      if (!data || (data as unknown[]).length === 0) return;

      const parsed = z.array(TriggerMessageSchema).safeParse(data);
      if (!parsed.success) {
        console.error("[sync-worker] message validation failed:", parsed.error);
        return;
      }

      let shouldRunBatch = false;

      for (const row of parsed.data) {
        try {
          switch (row.message.type) {
            case "notify":
              shouldRunBatch = true;
              break;
            case "document.deleted":
              await handleDelete(row.message, deps);
              break;
            default:
              assertNever(row.message);
          }

          const { error: ackError } = await deps.supabase.rpc(
            "ack_sync_event",
            { p_msg_id: row.msg_id },
          );
          if (ackError) {
            throw ackError;
          }
        } catch (err) {
          console.error("[sync-worker] message processing failed:", err);
        }
      }

      if (shouldRunBatch) {
        await runBatchCycle(deps);
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

async function runBatchCycle(deps: WorkerDeps): Promise<void> {
  // pending 순환: 처리 후 남은 pending이 있으면 즉시 다음 배치
  while (true) {
    const docs = await fetchPendingDocuments(deps.supabase);
    if (docs.length === 0) {
      break;
    }

    for (const doc of docs) {
      try {
        await processDocument(doc, deps);
      } catch (err) {
        console.error(`[sync-worker] failed to process doc ${doc.id}:`, err);
        await incrementRetry(deps.supabase, doc.id);
        continue;
      }
      await markCompleted(deps.supabase, doc.id);
    }
  }
}

async function fetchPendingDocuments(
  supabase: SupabaseClient,
): Promise<PendingDocument[]> {
  const { data, error } = await supabase.rpc("fetch_pending_documents", {
    p_max_retries: MAX_RETRIES,
  });

  if (error) {
    throw new Error(`fetch_pending_documents failed: ${error.message}`);
  }

  const parsed = z.array(PendingDocumentSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new Error(`pending doc validation failed: ${parsed.error.message}`);
  }

  return parsed.data;
}

async function markCompleted(
  supabase: SupabaseClient,
  docId: string,
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ ingestion_status: "completed" })
    .eq("id", docId);

  if (error) {
    throw new Error(`mark completed failed for doc ${docId}: ${error.message}`);
  }
}

async function incrementRetry(
  supabase: SupabaseClient,
  docId: string,
): Promise<void> {
  const { error } = await supabase.rpc("increment_ingestion_retry", {
    p_doc_id: docId,
    p_max_retries: MAX_RETRIES,
  });

  if (error) {
    throw new Error(
      `increment_ingestion_retry failed for doc ${docId}: ${error.message}`,
    );
  }
}

async function processDocument(
  doc: PendingDocument,
  deps: WorkerDeps,
): Promise<void> {
  const { llm, embedding, vectorStore, graphStore } = deps;

  const entityResult = await llm.generateStructured({
    schema: EntityExtractionSchema,
    schemaName: "entity_extraction",
    systemPrompt: ENTITY_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildEntityExtractionMessage(doc.body) },
    ],
  });

  const entities = entityResult.entities.map((e) => ({
    type: e.type,
    name: e.name,
  }));

  // delete → upsert: 신규 문서는 no-op, 수정 문서는 기존 인덱스 교체
  await vectorStore.deleteByDocument(doc.id);
  await graphStore.deleteByDocument(doc.id);

  await Promise.all([
    vectorStore.upsert(embedding, {
      docId: doc.id,
      userId: doc.user_id,
      chunks: [doc.body],
      tags: doc.tags,
      summary: doc.summary,
    }),
    graphStore.upsertEntities({
      docId: doc.id,
      userId: doc.user_id,
      entities,
    }),
  ]);
}

async function handleDelete(
  event: DeleteEvent,
  deps: WorkerDeps,
): Promise<void> {
  await deps.vectorStore.deleteByDocument(event.docId);
  await deps.graphStore.deleteByDocument(event.docId);
}

function assertNever(x: never): never {
  throw new Error(`Unexpected event type: ${JSON.stringify(x)}`);
}

import { z } from "zod";
import * as Sentry from "@sentry/node";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
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
const PROCESS_CONCURRENCY = 3;

interface WorkerDeps {
  supabase: TypedSupabaseClient;
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
    if (processing) {
      return;
    }
    processing = true;

    try {
      const { data, error } = await deps.supabase.rpc("read_sync_events", {
        p_batch_size: PGMQ_BATCH_SIZE,
        p_visibility_timeout: VISIBILITY_TIMEOUT_SEC,
      });

      if (error) {
        Sentry.captureMessage(`[sync-worker] read error: ${error.message}`, {
          level: "error",
          extra: { error },
        });
        return;
      }
      if (!data || !Array.isArray(data) || data.length === 0) {
        return;
      }

      const parsed = z.array(TriggerMessageSchema).safeParse(data);
      if (!parsed.success) {
        Sentry.captureMessage("[sync-worker] message validation failed", {
          level: "error",
          extra: { validationError: parsed.error },
        });
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
          Sentry.captureException(err, {
            tags: { component: "sync-worker" },
          });
        }
      }

      if (shouldRunBatch) {
        await runBatchCycle(deps);
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: "sync-worker" },
      });
    } finally {
      processing = false;
    }
  }

  return {
    start() {
      // eslint-disable-next-line no-console -- lifecycle log, no logger in worker context
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
      // eslint-disable-next-line no-console -- lifecycle log, no logger in worker context
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

    for (let i = 0; i < docs.length; i += PROCESS_CONCURRENCY) {
      const batch = docs.slice(i, i + PROCESS_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (doc) => {
          try {
            await processDocument(doc, deps);
          } catch (err) {
            Sentry.captureException(err, {
              tags: { component: "sync-worker" },
              extra: { docId: doc.id },
            });
            try {
              await incrementRetry(deps.supabase, doc.id);
            } catch (retryErr) {
              Sentry.captureException(retryErr, {
                tags: { component: "sync-worker", phase: "incrementRetry" },
                extra: { docId: doc.id },
              });
            }
            return;
          }
          try {
            await markCompleted(deps.supabase, doc.id);
          } catch (markErr) {
            Sentry.captureException(markErr, {
              tags: { component: "sync-worker", phase: "markCompleted" },
              extra: { docId: doc.id },
            });
          }
        }),
      );
    }
  }
}

async function fetchPendingDocuments(
  supabase: TypedSupabaseClient,
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
  supabase: TypedSupabaseClient,
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
  supabase: TypedSupabaseClient,
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

  const engineBody = doc.body_en ?? doc.body;
  const engineTags = doc.tags_en ?? doc.tags;
  const engineSummary = doc.summary_en ?? doc.summary;

  const entityResult = await llm.generateStructured({
    schema: EntityExtractionSchema,
    schemaName: "entity_extraction",
    systemPrompt: ENTITY_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildEntityExtractionMessage(engineBody) },
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
      chunks: [engineBody],
      tags: engineTags,
      summary: engineSummary,
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

import { z } from "zod";
import * as Sentry from "@sentry/node";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { EntityVectorStore, VectorStore } from "@server/infra/vector";
import {
  buildEntityExtractionMessage,
  ENTITY_EXTRACTION_SYSTEM_PROMPT,
  EntityExtractionSchema,
} from "@server/prompts/entity-extraction";
import { resolveEntities } from "@server/services/entity-resolution";

import type { DeleteEvent, PendingDocument } from "./types";
import { PendingDocumentSchema, TriggerMessageSchema } from "./types";

const MAX_RETRIES = 5;
const POLL_INTERVAL_MS = 2_000;
const ENTITY_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const ENTITY_PRUNE_LIST_LIMIT = 10_000;
// handleDelete 즉시 정리가 정상이면 prune에서 잡히는 orphan은 이름 치환 등 소수 케이스뿐.
// 이 임계치를 넘으면 즉시 정리 경로에 누수가 있다는 신호로 보고 warning.
const ENTITY_PRUNE_LEAK_ALERT_THRESHOLD = 100;
const PGMQ_BATCH_SIZE = 10;
const VISIBILITY_TIMEOUT_SEC = 60;
const PROCESS_CONCURRENCY = 3;

interface WorkerDeps {
  supabase: TypedSupabaseClient;
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
  graphStore: GraphStore;
  entityVectorStore: EntityVectorStore;
}

export function createSyncWorker(deps: WorkerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let pruneTimer: ReturnType<typeof setInterval> | null = null;
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

      pruneTimer = setInterval(() => {
        runEntityOrphanPrune(deps).catch((err) => {
          Sentry.captureException(err, {
            tags: { component: "sync-worker", phase: "entityOrphanPrune" },
          });
        });
      }, ENTITY_PRUNE_INTERVAL_MS);
    },

    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (pruneTimer) {
        clearInterval(pruneTimer);
        pruneTimer = null;
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
      const chunk = docs.slice(i, i + PROCESS_CONCURRENCY);
      await Promise.allSettled(
        chunk.map(async (doc) => {
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
  const { data, error } = await supabase.rpc("fetch_pending_memories", {
    p_max_retries: MAX_RETRIES,
  });

  if (error) {
    throw new Error(`fetch_pending_memories failed: ${error.message}`);
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
  const { error } = await supabase.rpc("complete_memory_ingestion", {
    p_memory_id: docId,
  });

  if (error) {
    throw new Error(`mark completed failed for doc ${docId}: ${error.message}`);
  }
}

async function incrementRetry(
  supabase: TypedSupabaseClient,
  docId: string,
): Promise<void> {
  const { error } = await supabase.rpc("increment_memory_ingestion_retry", {
    p_memory_id: docId,
    p_max_retries: MAX_RETRIES,
  });

  if (error) {
    throw new Error(
      `increment_memory_ingestion_retry failed for doc ${docId}: ${error.message}`,
    );
  }
}

async function processDocument(
  doc: PendingDocument,
  deps: WorkerDeps,
): Promise<void> {
  const { llm, embedding, vectorStore, graphStore, entityVectorStore } = deps;

  const engineBody = doc.body;
  const engineTags = doc.tags;
  const engineSummary = doc.summary;

  // 엔티티는 원문 언어로 name을 추출해야 하므로 translated body가 아닌 원문 body를 전달한다
  const entityResult = await llm.generateStructured({
    schema: EntityExtractionSchema,
    schemaName: "entity_extraction",
    systemPrompt: ENTITY_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildEntityExtractionMessage(doc.body) },
    ],
  });

  const extractedEntities = entityResult.entities.map((e) => ({
    type: e.type,
    name: e.name,
    nameEn: e.nameEn,
  }));

  // entity resolution: 기존 엔티티와 동일 개념이면 canonical name으로 치환
  let resolved;
  try {
    resolved = await resolveEntities({
      extractedEntities,
      userId: doc.user_id,
      graphStore,
      entityVectorStore,
      embedding,
      llm,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "entity-resolution", stage: "top-level" },
      extra: { docId: doc.id, userId: doc.user_id },
    });
    resolved = extractedEntities.map((e) => ({ ...e, isNew: true }));
  }

  // delete → upsert: 신규 문서는 no-op, 수정 문서는 기존 인덱스 교체
  await vectorStore.deleteByDocument(doc.id);
  const orphanedOnUpdate = await graphStore.deleteByDocument(doc.id);

  // 재처리 시 다시 upsert될 엔티티는 제외하고 orphan만 Qdrant에서 정리
  const resolvedKey = new Set(resolved.map((e) => `${e.type}:${e.name}`));
  const trulyOrphaned = orphanedOnUpdate.filter(
    (o) => !resolvedKey.has(`${o.type}:${o.name}`),
  );
  if (trulyOrphaned.length > 0) {
    await entityVectorStore.deleteByEntities(trulyOrphaned);
  }

  const newEntities = resolved.filter((e) => e.isNew);

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
      entities: resolved,
      createdAt: doc.created_at,
    }),
    newEntities.length > 0
      ? entityVectorStore.upsert(embedding, {
          userId: doc.user_id,
          entities: newEntities.map((e) => ({ name: e.name, type: e.type })),
        })
      : Promise.resolve(),
  ]);
}

async function handleDelete(
  event: DeleteEvent,
  deps: WorkerDeps,
): Promise<void> {
  await deps.vectorStore.deleteByDocument(event.docId);
  const orphaned = await deps.graphStore.deleteByDocument(event.docId);
  if (orphaned.length > 0) {
    await deps.entityVectorStore.deleteByEntities(orphaned);
  }
}

async function runEntityOrphanPrune(deps: WorkerDeps): Promise<void> {
  const { data: rows, error } = await deps.supabase.rpc("list_memory_user_ids");
  if (error) {
    throw new Error(`entity prune: failed to fetch user ids: ${error.message}`);
  }

  const userIds = (rows ?? []).map((r) => r.user_id);

  for (const userId of userIds) {
    try {
      const liveEntities = await deps.graphStore.listEntities({
        userId,
        limit: ENTITY_PRUNE_LIST_LIMIT,
      });
      // listEntities가 limit만큼 꽉 차면 잘렸을 가능성이 있음.
      // 이 상태로 prune하면 limit 초과 엔티티가 orphan으로 오판되어 삭제되므로 스킵.
      if (liveEntities.length >= ENTITY_PRUNE_LIST_LIMIT) {
        Sentry.captureMessage(
          "[entityOrphanPrune] listEntities hit limit; skipping prune to avoid false-positive deletion",
          {
            level: "warning",
            extra: { userId, limit: ENTITY_PRUNE_LIST_LIMIT },
          },
        );
        continue;
      }
      const pruned = await deps.entityVectorStore.pruneOrphans({
        userId,
        liveEntities,
      });
      if (pruned >= ENTITY_PRUNE_LEAK_ALERT_THRESHOLD) {
        Sentry.captureMessage(
          `[entityOrphanPrune] pruned ${pruned} orphan entities — possible leak in handleDelete`,
          { level: "warning", extra: { userId, pruned } },
        );
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: "sync-worker", phase: "entityOrphanPrune" },
        extra: { userId },
      });
    }
  }
}

function assertNever(x: never): never {
  throw new Error(`Unexpected event type: ${JSON.stringify(x)}`);
}

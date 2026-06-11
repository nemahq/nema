import { z } from "zod";
import * as Sentry from "@sentry/node";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { StatementUpsertItem, VectorStore } from "@server/infra/vector";
import type { ExtractedStatement } from "@server/prompts/statement-extraction";
import {
  buildStatementExtractionMessage,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";

import type { PendingSource, PendingStatement } from "./types";
import {
  PendingSourceSchema,
  PendingStatementSchema,
  TriggerMessageSchema,
} from "./types";

const MAX_RETRIES = 5;
export const POLL_INTERVAL_MS = 2_000;
// 실패한 행의 lease((retry+1)×30초)가 풀린 뒤 재시도를 깨울 notify가 따로 없으므로,
// 주기 사이클이 자동 재시도의 동력이다 (ingestion-design 5장의 재시도 계약).
const SWEEP_INTERVAL_MS = 60_000;
const PGMQ_BATCH_SIZE = 10;
const VISIBILITY_TIMEOUT_SEC = 60;
const EXTRACTION_CONCURRENCY = 3;

type Phase = "extraction" | "embedding";

interface WorkerDeps {
  supabase: TypedSupabaseClient;
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
}

export function createStatementSyncWorker(deps: WorkerDeps) {
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let sweepTimer: ReturnType<typeof setInterval> | null = null;
  let processing = false;
  let current: Promise<void> | null = null;

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
        Sentry.captureMessage(`[statement-sync] read error: ${error.message}`, {
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
        Sentry.captureMessage("[statement-sync] message validation failed", {
          level: "error",
          extra: { validationError: parsed.error },
        });
        return;
      }

      // 메시지 내용은 안 본다 — 전부 "깨워라"로 취급하고 ack
      for (const row of parsed.data) {
        const { error: ackError } = await deps.supabase.rpc("ack_sync_event", {
          p_msg_id: row.msg_id,
        });
        if (ackError) {
          Sentry.captureMessage(
            `[statement-sync] ack failed: ${ackError.message}`,
            { level: "error", extra: { msgId: row.msg_id } },
          );
        }
      }

      await runCycle(deps);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: "statement-sync" },
      });
    } finally {
      processing = false;
    }
  }

  async function sweep(): Promise<void> {
    if (processing) {
      return;
    }
    processing = true;
    try {
      await runCycle(deps);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: "statement-sync", phase: "sweep" },
      });
    } finally {
      processing = false;
    }
  }

  return {
    start() {
      // eslint-disable-next-line no-console -- lifecycle log, no logger in worker context
      console.log("[statement-sync] started");
      pollTimer = setInterval(() => {
        current = poll();
      }, POLL_INTERVAL_MS);
      sweepTimer = setInterval(() => {
        current = sweep();
      }, SWEEP_INTERVAL_MS);
      // 재기동 직후 1회 — 죽기 전에 ack까지 끝낸 notify의 잔여 pending을 줍는다
      current = sweep();
    },

    async stop() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
      }
      if (current) {
        await current;
      }
      // eslint-disable-next-line no-console -- lifecycle log, no logger in worker context
      console.log("[statement-sync] stopped");
    },
  };
}

// 사이클: ① 추출 → ② 임베딩, 둘 다 빌 때까지.
// ①이 pending 진술을 만들어내므로 이 순서면 한 번 깨어난 김에 임베딩까지 끝난다.
async function runCycle(deps: WorkerDeps): Promise<void> {
  while (true) {
    const extracted = await runExtractionPass(deps);
    const embedded = await runEmbeddingPass(deps);
    if (extracted === 0 && embedded === 0) {
      break;
    }
  }
}

// --- ① 추출 ---

async function runExtractionPass(deps: WorkerDeps): Promise<number> {
  let processed = 0;

  while (true) {
    const sources = await fetchPendingSources(deps.supabase);
    if (sources.length === 0) {
      break;
    }
    processed += sources.length;

    for (let i = 0; i < sources.length; i += EXTRACTION_CONCURRENCY) {
      const chunk = sources.slice(i, i + EXTRACTION_CONCURRENCY);
      await Promise.allSettled(
        chunk.map(async (source) => {
          try {
            await processSource(source, deps);
          } catch (err) {
            Sentry.captureException(err, {
              tags: { component: "statement-sync", phase: "extraction" },
              extra: { sourceId: source.id },
            });
            await incrementRetry(deps.supabase, {
              phase: "extraction",
              id: source.id,
              errorMessage: err instanceof Error ? err.message : String(err),
            });
          }
        }),
      );
    }
  }

  return processed;
}

async function processSource(
  source: PendingSource,
  deps: WorkerDeps,
): Promise<void> {
  const output = await deps.llm.generateStructured({
    schema: StatementExtractionSchema,
    schemaName: "statement_extraction",
    systemPrompt: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildStatementExtractionMessage(source.body) },
    ],
  });

  const statements = normalizeStatements(output.statements);

  // 진술 0개(노이즈뿐인 글)면 빈 changeset을 남기지 않는다
  if (statements.length === 0) {
    const { error } = await deps.supabase.rpc("complete_source_extraction", {
      p_source_id: source.id,
    });
    if (error) {
      throw new Error(
        `complete_source_extraction failed for ${source.id}: ${error.message}`,
      );
    }
    return;
  }

  const { error } = await deps.supabase.rpc("apply_ingestion_changeset", {
    p_source_id: source.id,
    p_statements: statements,
  });
  if (error) {
    throw new Error(
      `apply_ingestion_changeset failed for ${source.id}: ${error.message}`,
    );
  }
}

// 출력 순서 = 원문 순서 계약이므로 index는 배열 위치에서 파생.
// DB 제약(claim만 confidence)과 맞도록 방어 정규화 — 과장 금지 원칙이라 빠진 확신도는 guess.
function normalizeStatements(raw: ExtractedStatement[]): Array<{
  content: string;
  type: ExtractedStatement["type"];
  confidence: ExtractedStatement["confidence"];
  index: number;
}> {
  return raw.map((statement, index) => ({
    content: statement.content,
    type: statement.type,
    confidence:
      statement.type === "claim" ? (statement.confidence ?? "guess") : null,
    index,
  }));
}

async function fetchPendingSources(
  supabase: TypedSupabaseClient,
): Promise<PendingSource[]> {
  const { data, error } = await supabase.rpc("fetch_pending_sources", {
    p_max_retries: MAX_RETRIES,
  });
  if (error) {
    throw new Error(`fetch_pending_sources failed: ${error.message}`);
  }

  const parsed = z.array(PendingSourceSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new Error(
      `pending source validation failed: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

// --- ② 임베딩 (선언적 동기화: active → upsert, archived → delete) ---

async function runEmbeddingPass(deps: WorkerDeps): Promise<number> {
  let processed = 0;

  while (true) {
    const statements = await fetchPendingStatements(deps.supabase);
    if (statements.length === 0) {
      break;
    }
    processed += statements.length;

    const active = statements.filter((s) => s.status === "active");
    const archived = statements.filter((s) => s.status === "archived");

    await syncBatch({
      deps,
      batch: active,
      run: (batch) =>
        deps.vectorStore.upsertStatements(
          deps.embedding,
          batch.map(toUpsertItem),
        ),
    });
    await syncBatch({
      deps,
      batch: archived,
      run: (batch) => deps.vectorStore.deleteStatements(batch.map((s) => s.id)),
    });
  }

  return processed;
}

// 진술은 짧아서 임베딩은 인출 배치 단위로 묶는다(fetch가 10개 한도라 그대로 배치 크기).
// 배치가 실패하면 배치원 전부 retry — 다음 인출에서 같은 묶음이 다시 온다.
async function syncBatch(params: {
  deps: WorkerDeps;
  batch: PendingStatement[];
  run: (batch: PendingStatement[]) => Promise<void>;
}): Promise<void> {
  const { deps, batch, run } = params;
  if (batch.length === 0) {
    return;
  }

  try {
    await run(batch);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "statement-sync", phase: "embedding" },
      extra: { statementIds: batch.map((s) => s.id) },
    });
    await Promise.allSettled(
      batch.map((statement) =>
        incrementRetry(deps.supabase, {
          phase: "embedding",
          id: statement.id,
          errorMessage: err instanceof Error ? err.message : String(err),
        }),
      ),
    );
    return;
  }

  await Promise.allSettled(
    batch.map(async (statement) => {
      const { error } = await deps.supabase.rpc(
        "complete_statement_ingestion",
        { p_statement_id: statement.id },
      );
      if (error) {
        // 완료 표시만 실패 — 다음 사이클이 같은 진술을 재처리한다 (point id가
        // statement_id라 upsert/delete 모두 멱등)
        Sentry.captureException(
          new Error(
            `complete_statement_ingestion failed for ${statement.id}: ${error.message}`,
          ),
          { tags: { component: "statement-sync", phase: "embedding" } },
        );
      }
    }),
  );
}

function toUpsertItem(statement: PendingStatement): StatementUpsertItem {
  return {
    statementId: statement.id,
    spaceId: statement.space_id,
    content: statement.content,
    type: statement.type,
    confidence: statement.confidence,
    createdAt: statement.created_at,
  };
}

async function fetchPendingStatements(
  supabase: TypedSupabaseClient,
): Promise<PendingStatement[]> {
  const { data, error } = await supabase.rpc("fetch_pending_statements", {
    p_max_retries: MAX_RETRIES,
  });
  if (error) {
    throw new Error(`fetch_pending_statements failed: ${error.message}`);
  }

  const parsed = z.array(PendingStatementSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new Error(
      `pending statement validation failed: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

// --- 공통 재시도 ---

async function incrementRetry(
  supabase: TypedSupabaseClient,
  params: { phase: Phase; id: string; errorMessage: string },
): Promise<void> {
  const { phase, id, errorMessage } = params;

  const { error } =
    phase === "extraction"
      ? await supabase.rpc("increment_source_extraction_retry", {
          p_source_id: id,
          p_max_retries: MAX_RETRIES,
          p_error_message: errorMessage,
        })
      : await supabase.rpc("increment_statement_ingestion_retry", {
          p_statement_id: id,
          p_max_retries: MAX_RETRIES,
          p_error_message: errorMessage,
        });

  if (error) {
    Sentry.captureException(
      new Error(`increment retry failed for ${id}: ${error.message}`),
      { tags: { component: "statement-sync", phase } },
    );
  }
}

import { z } from "zod";
import * as Sentry from "@sentry/node";

import type { EmbeddingProvider } from "@server/infra/embedding";
import { createLimiter } from "@server/infra/llm/limiter";
import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { StatementUpsertItem, VectorStore } from "@server/infra/vector";
import type { ExtractedStatement } from "@server/prompts/statement-extraction";
import {
  buildStatementExtractionMessage,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";

import type { ExtractionChunk } from "./chunking";
import { chunkForExtraction } from "./chunking";
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
// 추출 호출 한정 — 절단은 규칙 적용에 가까워 깊은 추론이 불필요한데, gpt-5의
// 추론 시간 변동이 기본 30초 타임아웃을 자주 넘겨 짧은 글도 조용히 실패했다
// (measurement-log #3 + E2E 실증). effort를 낮춰 변동의 뿌리를 줄이고,
// SDK 자동 재시도는 꺼서(maxRetries 0) 타임아웃이 진짜 벽시계 상한이 되게
// 한다 — 재시도 주인은 DB lease 사이클 한 층.
//
// 타임아웃 120초의 근거(measurement-log #5): 제공자의 정상 응답이 시간대에
// 따라 같은 입력 기준 1.5~2.3배 출렁여, 60초는 느린 시간대의 *정상* 호출
// (1,278토큰 입력이 74~89초)을 죽은 호출로 오판해 끊는다. 타임아웃의 일은
// 행 걸린 호출 회수 하나 — 비동기 파이프라 높게 잡는 오차는 복구 몇 분
// 지연으로 싸고, 낮게 잡는 오차는 정상 작업 폐기로 비싸다.
// lease(150초, extraction_lease_covers_slow_provider 마이그레이션)가 이 상한을
// 덮는다. eval 러너가 같은 값을 미러링한다.
export const EXTRACTION_REASONING_EFFORT = "low" as const;
export const EXTRACTION_TIMEOUT_MS = 120_000;

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

      // 메시지 내용은 안 본다 — 전부 "깨워라"로 취급하고 ack.
      // malformed 메시지도 ack한다 — 안 하면 영구 재전달되며 매 사이클 알림을 도배한다.
      const parsed = z.array(TriggerMessageSchema).safeParse(data);
      if (!parsed.success) {
        Sentry.captureMessage("[statement-sync] message validation failed", {
          level: "error",
          extra: { validationError: parsed.error },
        });
      }

      const msgIds = parsed.success
        ? parsed.data.map((row) => row.msg_id)
        : data.flatMap((row: unknown) => {
            const id = (row as { msg_id?: unknown })?.msg_id;
            return typeof id === "number" ? [id] : [];
          });

      for (const msgId of msgIds) {
        const { error: ackError } = await deps.supabase.rpc("ack_sync_event", {
          p_msg_id: msgId,
        });
        if (ackError) {
          Sentry.captureMessage(
            `[statement-sync] ack failed: ${ackError.message}`,
            { level: "error", extra: { msgId } },
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
      // processing 중엔 current를 덮어쓰지 않는다 — poll/sweep은 진입 즉시(동기로)
      // processing을 잡으므로, 이 가드면 current는 항상 실제 일을 시작한 promise를
      // 가리키고 stop()의 await current가 in-flight 사이클을 끝까지 기다린다.
      pollTimer = setInterval(() => {
        if (!processing) {
          current = poll();
        }
      }, POLL_INTERVAL_MS);
      sweepTimer = setInterval(() => {
        if (!processing) {
          current = sweep();
        }
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
  const extracted = await extractSourceStatements(deps.llm, source.body);
  const statements = normalizeStatements(extracted);

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

// --- 추출 — 임계선 이하 1콜, 초과 시 청크 병렬 (long-input-chunking 설계) ---

// 동시 LLM 콜 상한은 이 한 군데서 관리한다 — source 병렬(EXTRACTION_CONCURRENCY)과
// 청크 병렬이 곱으로 불어나지 않게, 모든 추출 콜이 같은 제한기를 지난다.
// 동시 4 초과 시 제공자 타임아웃이 관찰된 전례(measurement-log #3)로 3.
const LLM_CALL_CONCURRENCY = 3;
// 청크 콜 한정 재시도 — 단일 콜 실패는 DB lease 재시도가 받지만, 분할 경로는
// 청크 하나의 일시 실패가 성공한 나머지 전부를 버리게 하므로 콜 레벨 방어가 먼저다.
const CHUNK_CALL_MAX_ATTEMPTS = 3;
// rate_limit 직후 즉시 재시도는 또 걸린다 — 시도 횟수 비례 지연
const CHUNK_CALL_RETRY_DELAY_MS = 2_000;
// 결정적 실패(스키마·인증·콘텐츠 필터)는 재시도해도 같다 — 일시 오류만 재시도
const RETRYABLE_LLM_CODES: ReadonlySet<string> = new Set([
  "timeout",
  "rate_limit",
  "unknown",
]);

const limitLlmCall = createLimiter(LLM_CALL_CONCURRENCY);

async function extractSourceStatements(
  llm: LlmProvider,
  body: string,
): Promise<ExtractedStatement[]> {
  const chunks = chunkForExtraction(body);

  // 임계선 이하(1청크, 문맥 없음) — 기존 1콜 경로 그대로
  const single = chunks.length === 1 ? chunks[0] : undefined;
  if (single) {
    const output = await limitLlmCall(() => callExtraction(llm, single));
    return output.statements;
  }

  // 청크 병렬 — 입력(본문+문맥)이 분할 시점에 전부 확정돼 있어 앞 콜 결과를
  // 기다릴 필요가 없다. 하나라도 실패하면 source 전체 실패(부분 저장 없음) —
  // Promise.all의 첫 reject가 그대로 전파돼 호출자의 재시도 경로를 탄다.
  const outputs = await Promise.all(
    chunks.map((chunk) =>
      limitLlmCall(() => callExtractionWithRetry(llm, chunk)),
    ),
  );
  // 청크 순서대로 연결 = 원문 등장 순서 — index는 normalizeStatements가 재부여
  return outputs.flatMap((output) => output.statements);
}

function callExtraction(llm: LlmProvider, chunk: ExtractionChunk) {
  return llm.generateStructured({
    schema: StatementExtractionSchema,
    schemaName: "statement_extraction",
    systemPrompt: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildStatementExtractionMessage(chunk.body, {
          before: chunk.contextBefore,
          after: chunk.contextAfter,
        }),
      },
    ],
    reasoningEffort: EXTRACTION_REASONING_EFFORT,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    maxRetries: 0,
  });
}

async function callExtractionWithRetry(
  llm: LlmProvider,
  chunk: ExtractionChunk,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CHUNK_CALL_MAX_ATTEMPTS; attempt++) {
    try {
      return await callExtraction(llm, chunk);
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof LlmError && RETRYABLE_LLM_CODES.has(err.code);
      if (!retryable || attempt === CHUNK_CALL_MAX_ATTEMPTS) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * CHUNK_CALL_RETRY_DELAY_MS),
      );
    }
  }
  throw lastError;
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

import { DateTime, IANAZone } from "luxon";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import type { RelationType } from "@nema-io/shared";

import type { Json } from "@server/infra/database.types";
import type { EmbeddingProvider } from "@server/infra/embedding";
import { createLimiter } from "@server/infra/llm/limiter";
import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { LlmTask } from "@server/infra/llm/task-routing";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type {
  NeighborSearchOptions,
  StatementSearchHit,
  StatementUpsertItem,
  VectorStore,
} from "@server/infra/vector";
import type {
  DuplicateProposal,
  LabeledStatement,
  RelationProposal,
} from "@server/prompts/relation-judgment";
import {
  buildRelationJudgmentMessage,
  RELATION_JUDGMENT_SYSTEM_PROMPT,
  RelationJudgmentSchema,
} from "@server/prompts/relation-judgment";
import type { ExtractedStatement } from "@server/prompts/statement-extraction";
import {
  buildStatementExtractionMessage,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";
import { resolveDeadlineToDueDate } from "@server/temporal/deadline";

import type { ExtractionChunk } from "./chunking";
import { chunkForExtraction } from "./chunking";
import type {
  LinkingBatchStatement,
  LinkingCandidateStatement,
  PendingLinkingSource,
  PendingSource,
  PendingStatement,
} from "./types";
import {
  LinkingBatchStatementSchema,
  LinkingCandidateStatementSchema,
  PendingLinkingSourceSchema,
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
// 라이브 경로의 effort는 task 라우팅(extractStatements) 바인딩이 정한다. 이 상수는
// eval 러너가 같은 값을 직접 재현하기 위한 미러다.
export const EXTRACTION_EFFORT = "low" as const;
export const EXTRACTION_TIMEOUT_MS = 120_000;

// --- ③ 잇기(linking) ---
const LINKING_CONCURRENCY = 3;
// 판정도 standard 티어 LLM 1콜이라 추출과 같은 상한·effort를 미러한다.
// lease(150초, relation_linking_rpcs)가 이 타임아웃을 덮는다.
export const LINKING_EFFORT = "low" as const;
export const LINKING_TIMEOUT_MS = 120_000;
// 후보 좁히기 ⓐ(벡터 근접) — NEM-165 실데이터 보정(run-candidate-retrieval).
// 진짜 관계 쌍은 순위 ≤3에 몰리고 우연한 주제 이웃(거짓충돌·near-dup)은 ≥8에 떨어져,
// 그 사이 빈 구간 끝인 7로 둔다: 함정을 후보에서 빼면서도 코퍼스가 커져 파트너 순위가
// 밀릴 여유를 남긴다. 같은 글 형제(ⓑ)는 새 진술 배치에 이미 들어 있어 점수 무관.
const CANDIDATE_TOP_K = 7;
// cosine 유사도 하한. 충돌 쌍이 0.554에 걸려(NEM-165) 이게 진짜 관계가 사는 바닥선 —
// 더 올리면 충돌을 놓치고, 더 내려도 후보만 늘 뿐 recall은 그대로다.
const CANDIDATE_SCORE_THRESHOLD = 0.5;
// 앵커별 이웃 검색의 일시 실패(Qdrant 블립) 흡수 — 추출 청크 콜과 같은 정책.
const NEIGHBOR_SEARCH_MAX_ATTEMPTS = 3;
const NEIGHBOR_SEARCH_RETRY_DELAY_MS = 2_000;
// 한 잇기 콜에 넣을 새 진술 상한 — 장문 source(초장문 분할로 진술 수백)가 새 진술 전부 +
// 후보 전부를 한 프롬프트에 욱여넣어 컨텍스트 초과·판정 품질 붕괴되는 걸 막는다(추출의
// 토큰 청킹에 대응하는 잇기판, 단위는 진술 수). 구속 조건은 컨텍스트가 아니라 판정 품질
// 이라 보수적으로 작게: "한입에 판정할 만한" 수십 개. 진짜 무릎은 dogfooding이 측정(§11).
const MAX_STATEMENTS_PER_LINKING_CALL = 30;

type Phase = "extraction" | "embedding" | "linking";

interface WorkerDeps {
  supabase: TypedSupabaseClient;
  // 추출·관계 판정이 서로 다른 모델을 쓸 수 있게 단일 llm 대신 task 라우터를 받는다.
  // 워커는 자기 두 콜(extractStatements/judgeRelations)을 task로 해석해 모델을 고른다.
  forTask: (task: LlmTask) => LlmProvider;
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

// 사이클: ① 추출 → ② 임베딩 → ③ 잇기, 셋 다 빌 때까지.
// ①이 pending 진술을, ②가 잇기 대상(임베딩 끝난 원본)을 만들어내므로 이 순서면
// 한 번 깨어난 김에 추출·임베딩·잇기까지 끝난다 (relation-design §3).
async function runCycle(deps: WorkerDeps): Promise<void> {
  while (true) {
    const extracted = await runExtractionPass(deps);
    const embedded = await runEmbeddingPass(deps);
    const linked = await runLinkingPass(deps);
    if (extracted === 0 && embedded === 0 && linked === 0) {
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

// 기한 정규화 기준 — 내용 속 "금요일"은 글 쓴 시점·작성자 존 기준이다(temporal-query-design 7장).
// 존이 없거나 유효하지 않으면 UTC로 강등(옛 글·미전달은 날 경계가 약간 어긋나도 허용).
function deadlineContext(source: PendingSource): {
  reference: Date;
  timeZone: string;
  todayIsoDate: string;
} {
  const reference = new Date(source.created_at);
  const timeZone =
    source.author_timezone !== null &&
    IANAZone.isValidZone(source.author_timezone)
      ? source.author_timezone
      : "UTC";
  const todayIsoDate =
    DateTime.fromJSDate(reference, { zone: timeZone }).toISODate() ?? "";
  return { reference, timeZone, todayIsoDate };
}

async function processSource(
  source: PendingSource,
  deps: WorkerDeps,
): Promise<void> {
  const { reference, timeZone, todayIsoDate } = deadlineContext(source);
  const extracted = await extractSourceStatements(
    deps.forTask("extractStatements"),
    {
      body: source.body,
      todayIsoDate,
    },
  );
  const statements = normalizeStatements(extracted, { reference, timeZone });

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
// 결정적 실패(스키마·인증·콘텐츠 필터)는 재시도해도 같다 — 일시 오류만 재시도.
// unknown은 provider가 분류 못 한 오류로, 일시 장애와 결정적 실패를 함께 묶는다 —
// 후자면 3회를 헛쓰지만 숨지 않고 결국 Sentry+DB로 전파되므로 보수적으로 포함한다.
// 청크 콜이 결정적 실패로 죽으면 source 전체가 lease 사이클로 MAX_RETRIES회 통째
// 재추출되며 매번 같은 자리서 실패한다(원자성 대가의 비용 증폭, 동작은 의도대로).
const RETRYABLE_LLM_CODES: ReadonlySet<string> = new Set([
  "timeout",
  "rate_limit",
  "unknown",
]);

const limitLlmCall = createLimiter(LLM_CALL_CONCURRENCY);

async function extractSourceStatements(
  llm: LlmProvider,
  input: { body: string; todayIsoDate: string },
): Promise<ExtractedStatement[]> {
  const chunks = chunkForExtraction(input.body);
  const { todayIsoDate } = input;

  // 임계선 이하(1청크, 문맥 없음) — 기존 1콜 경로 그대로
  const single = chunks.length === 1 ? chunks[0] : undefined;
  if (single) {
    const output = await limitLlmCall(() =>
      callExtraction(llm, { chunk: single, todayIsoDate }),
    );
    return output.statements;
  }

  // 청크 병렬 — 입력(본문+문맥)이 분할 시점에 전부 확정돼 있어 앞 콜 결과를
  // 기다릴 필요가 없다. 하나라도 실패하면 source 전체 실패(부분 저장 없음) —
  // Promise.all의 첫 reject가 그대로 전파돼 호출자의 재시도 경로를 탄다.
  const outputs = await Promise.all(
    chunks.map((chunk) =>
      limitLlmCall(() => callExtractionWithRetry(llm, { chunk, todayIsoDate })),
    ),
  );
  // 청크 순서대로 연결 = 원문 등장 순서 — index는 normalizeStatements가 재부여
  return outputs.flatMap((output) => output.statements);
}

function callExtraction(
  llm: LlmProvider,
  args: { chunk: ExtractionChunk; todayIsoDate: string },
) {
  return llm.generateStructured({
    schema: StatementExtractionSchema,
    schemaName: "statement_extraction",
    systemPrompt: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildStatementExtractionMessage(args.chunk.body, {
          todayIsoDate: args.todayIsoDate,
          before: args.chunk.contextBefore,
          after: args.chunk.contextAfter,
        }),
      },
    ],
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    maxRetries: 0,
  });
}

async function callExtractionWithRetry(
  llm: LlmProvider,
  args: { chunk: ExtractionChunk; todayIsoDate: string },
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CHUNK_CALL_MAX_ATTEMPTS; attempt++) {
    try {
      return await callExtraction(llm, args);
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
function normalizeStatements(
  raw: ExtractedStatement[],
  context: { reference: Date; timeZone: string },
): Array<{
  content: string;
  type: ExtractedStatement["type"];
  confidence: ExtractedStatement["confidence"];
  index: number;
  due_date: string | null;
}> {
  return raw.map((statement, index) => ({
    content: statement.content,
    type: statement.type,
    confidence:
      statement.type === "claim" ? (statement.confidence ?? "guess") : null,
    index,
    // 기한 토큰을 작성 시점·존 기준 절대 날짜로. 기한 없거나 불량 토큰이면 null.
    due_date: statement.deadline
      ? resolveDeadlineToDueDate(statement.deadline, context)
      : null,
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

// --- ③ 잇기 (후보 좁히기 → LLM 판정 → 게이트 → relation 변경셋) ---

async function runLinkingPass(deps: WorkerDeps): Promise<number> {
  let processed = 0;

  while (true) {
    const sources = await fetchPendingLinkingSources(deps.supabase);
    if (sources.length === 0) {
      break;
    }
    processed += sources.length;

    for (let i = 0; i < sources.length; i += LINKING_CONCURRENCY) {
      const chunk = sources.slice(i, i + LINKING_CONCURRENCY);
      await Promise.allSettled(
        chunk.map(async (source) => {
          try {
            await processLinking(source, deps);
          } catch (err) {
            Sentry.captureException(err, {
              tags: { component: "statement-sync", phase: "linking" },
              extra: { sourceId: source.id },
            });
            await incrementRetry(deps.supabase, {
              phase: "linking",
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

async function processLinking(
  source: PendingLinkingSource,
  deps: WorkerDeps,
): Promise<void> {
  const batch = await fetchSourceStatements(deps.supabase, source.id);

  // 장문 source는 진술이 수백이 될 수 있다 — 새 진술 전부를 한 콜에 넣으면 컨텍스트
  // 초과·판정 품질 붕괴라, 원문 순서대로 sub-batch로 끊어 콜을 나눈다. 인접 진술(결정+
  // 바로 뒤 근거)이 같은 sub-batch에 남아 형제 관계를 그 안에서 잡고, 떨어진 형제는 ⓐ가
  // 복원한다. ≤상한이면 sub-batch 1개라 짧은 글은 기존 동작 그대로.
  // sub-batch 중 하나라도 실패하면(전파) source 전체가 lease 재시도로 다시 돈다 —
  // 성공한 sub-batch의 LLM 콜까지 재실행된다. 적용이 끝에 1회뿐이라 부분 적용이 없는
  // 대가다(추출 경로의 청크 원자성 비용과 같은 결). 정합성 > 재실행 비용.
  const subBatches = chunkStatements(batch, MAX_STATEMENTS_PER_LINKING_CALL);
  const applied: RelationChange[] = [];
  const pending: RelationChange[] = [];
  const duplicatesByArchive = new Map<string, DuplicateChange>();
  for (const subBatch of subBatches) {
    const result = await linkSubBatch({
      subBatch,
      spaceId: source.space_id,
      deps,
    });
    applied.push(...result.applied);
    pending.push(...result.pending);
    // 가릴 진술당 한 번만 — sub-batch 사이 같은 진술이 또 와도 첫 쌍만.
    for (const pair of result.duplicates) {
      if (!duplicatesByArchive.has(pair.duplicate)) {
        duplicatesByArchive.set(pair.duplicate, pair);
      }
    }
  }

  // K개 sub-batch 결과를 모아 source당 1번 적용 — 되돌리기 단위는 글이라 applied 변경셋도
  // 글당 1개여야 한다(§6). 배치 0개(노이즈뿐)면 빈 적용으로 완료만.
  const { applied: finalApplied, pending: finalPending } = reconcileChanges(
    applied,
    pending,
  );
  await applyRelationChangesets({
    supabase: deps.supabase,
    sourceId: source.id,
    applied: finalApplied,
    pending: finalPending,
    duplicates: [...duplicatesByArchive.values()],
  });
}

// 한 sub-batch 잇기 — 후보 좁히기 → LLM 판정 → 게이트. 후보 제외는 이 sub-batch의 id만
// (다른 sub-batch의 형제는 후보로 끌려와야 분할로 끊긴 형제 관계가 ⓐ로 복원된다).
async function linkSubBatch(params: {
  subBatch: LinkingBatchStatement[];
  spaceId: string;
  deps: WorkerDeps;
}): Promise<{
  applied: RelationChange[];
  pending: RelationChange[];
  duplicates: DuplicateChange[];
}> {
  const { subBatch, spaceId, deps } = params;
  // ⓐ 뜻의 이웃 — 벡터 있는(임베딩 completed) 새 진술마다 최근접.
  const subBatchIds = new Set(subBatch.map((s) => s.id));
  const neighborIdLists: string[][] = [];
  for (const statement of subBatch) {
    if (statement.ingestion_status !== "completed") {
      continue; // 벡터 없는 진술은 자기 이웃 검색의 앵커가 될 수 없다
    }
    const hits = await searchNeighborsWithRetry(deps.vectorStore, {
      statementId: statement.id,
      spaceId,
      limit: CANDIDATE_TOP_K,
      scoreThreshold: CANDIDATE_SCORE_THRESHOLD,
    });
    neighborIdLists.push(hits.map((h) => h.statementId));
  }
  const candidateIds = selectCandidateIds(neighborIdLists, subBatchIds);

  const candidates =
    candidateIds.length > 0
      ? await fetchCandidateStatements(deps.supabase, candidateIds)
      : [];

  // 비교 대상이 둘 미만(새 1개 + 후보 0개)이면 관계가 생길 수 없다 — LLM 생략
  if (!canFormRelations(subBatch.length, candidates.length)) {
    return { applied: [], pending: [], duplicates: [] };
  }

  // 라벨 부여 + id 매핑 — LLM엔 라벨(N0/E1…)만 보여 uuid 환각을 막는다
  const labelToId = new Map<string, string>();
  const newLabeled: LabeledStatement[] = subBatch.map((statement, index) => {
    const label = `N${index}`;
    labelToId.set(label, statement.id);
    return {
      label,
      content: statement.content,
      type: statement.type,
      confidence: statement.confidence,
    };
  });
  const existingLabeled: LabeledStatement[] = candidates.map(
    (statement, index) => {
      const label = `E${index}`;
      labelToId.set(label, statement.id);
      return {
        label,
        content: statement.content,
        type: statement.type,
        confidence: statement.confidence,
      };
    },
  );

  const message = buildRelationJudgmentMessage(newLabeled, existingLabeled);
  const output = await limitLlmCall(() =>
    callJudgmentWithRetry(deps.forTask("judgeRelations"), message),
  );

  const gated = gateProposals({
    proposals: output.relations,
    labelToId,
    batchIds: subBatchIds,
  });
  const duplicates = selectDuplicatePairs({
    duplicates: output.duplicates,
    labelToId,
    batchIds: subBatchIds,
  });
  return { ...gated, duplicates };
}

// 새 진술을 원문 순서 보존하며 size개씩 끊는다 (장문 source의 잇기 콜 분할).
export function chunkStatements<T>(statements: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < statements.length; i += size) {
    chunks.push(statements.slice(i, i + size));
  }
  return chunks;
}

// sub-batch 결과를 합친 뒤 중복 제거 — 같은 관계가 여러 sub-batch에서 제안될 수 있다
// (서로의 후보로 끌려옴). conflicts는 대칭이라 양끝 정렬 키로 역방향까지 collapse
// (gateProposals와 같은 규칙).
export function dedupeChanges(changes: RelationChange[]): RelationChange[] {
  const seen = new Set<string>();
  const result: RelationChange[] = [];
  for (const change of changes) {
    const key = changeKey(change);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(change);
  }
  return result;
}

// 누적된 sub-batch 결과를 적용 직전 정리. 각 리스트를 dedup하고, applied에 든 쌍을
// pending에서 뺀다(applied 우선). gateProposals의 "한 쌍 = applied XOR pending" 불변식은
// 콜 단위라, sub-batch로 갈리면 같은 쌍이 한 콜에선 applied·다른 콜에선 pending으로
// 판정될 수 있다(컨텍스트가 달라 — 서로의 후보로 끌려옴). confident 판정을 우선해, 이미
// 적용될 관계를 사람이 또 검토하는 무의미한 항목을 막는다.
export function reconcileChanges(
  applied: RelationChange[],
  pending: RelationChange[],
): { applied: RelationChange[]; pending: RelationChange[] } {
  const dedupedApplied = dedupeChanges(applied);
  const appliedKeys = new Set(dedupedApplied.map(changeKey));
  const dedupedPending = dedupeChanges(pending).filter(
    (change) => !appliedKeys.has(changeKey(change)),
  );
  return { applied: dedupedApplied, pending: dedupedPending };
}

// 앵커별 이웃 검색의 일시 실패(Qdrant 블립)를 흡수한다 — 임베딩 패스가 Qdrant를
// 멱등 재시도하는 것과 같은 회복력을 잇기에도 준다. 끝내 실패하면 전파해 source
// 단위 lease 재시도가 받는다(완전 장애는 failed→수동 재개로 복구). 재시도가 없으면
// 한 앵커의 블립이 source의 retry 예산을 태우고 잇기 전체를 버린다.
async function searchNeighborsWithRetry(
  vectorStore: VectorStore,
  options: NeighborSearchOptions,
): Promise<StatementSearchHit[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= NEIGHBOR_SEARCH_MAX_ATTEMPTS; attempt++) {
    try {
      return await vectorStore.searchNeighbors(options);
    } catch (err) {
      lastError = err;
      if (attempt === NEIGHBOR_SEARCH_MAX_ATTEMPTS) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * NEIGHBOR_SEARCH_RETRY_DELAY_MS),
      );
    }
  }
  throw lastError;
}

// 후보 = 앵커별 이웃을 합치고 중복·형제(같은 배치)를 걷어낸 기존 진술 id들.
// 형제는 새 진술 목록(batch)이 이미 담으므로 후보에서 뺀다 (relation-design §4).
export function selectCandidateIds(
  neighborIdLists: string[][],
  batchIds: Set<string>,
): string[] {
  const ids = new Set<string>();
  for (const list of neighborIdLists) {
    for (const id of list) {
      if (!batchIds.has(id)) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

// 가릴 진술 → 남길 진술 쌍 (NEM-162) — 가릴 쪽(duplicate 라벨)이 이번 배치의 새 진술일 때만.
// 기존 진술은 새 글 투입으로 가리지 않는다(오래된 기록이 조용히 사라지는 놀람 방지 —
// 프롬프트도 "duplicate=새 진술 우선"로 유도). 모르는 라벨은 버리고, 가릴 진술당 한 번만.
//
// 남길 쪽(keeper)이 살아남는 것까지 보장한다: keeper가 실재하고, keeper 자신이 가려질
// 대상이 아닐 때만 가린다. 대칭쌍([{dup:A,of:B},{dup:B,of:A}])이나 of 환각이면 둘 다
// 가려져 흡수할 원본이 사라지므로(무소음 데이터 손실) 그런 쌍은 통째로 버린다.
// keeper는 archive하며 statements.duplicate_of에 박혀 합쳐진 출처 집계의 뿌리가 된다.
export function selectDuplicatePairs(params: {
  duplicates: DuplicateProposal[];
  labelToId: Map<string, string>;
  batchIds: Set<string>;
}): DuplicateChange[] {
  const { duplicates, labelToId, batchIds } = params;
  // 1차: 가릴 후보(새 진술)를 모은다 — keeper 생존 검사의 기준 집합.
  const archiveCandidates = new Set<string>();
  for (const duplicate of duplicates) {
    const archiveId = labelToId.get(duplicate.duplicate);
    if (archiveId && batchIds.has(archiveId)) {
      archiveCandidates.add(archiveId);
    }
  }
  // 2차: keeper가 실재하고 가려지지 않을 때만 확정. 가릴 진술당 첫 keeper 하나.
  const byArchive = new Map<string, string>();
  for (const duplicate of duplicates) {
    const archiveId = labelToId.get(duplicate.duplicate);
    const keeperId = labelToId.get(duplicate.of);
    if (!archiveId || !batchIds.has(archiveId) || byArchive.has(archiveId)) {
      continue;
    }
    if (
      !keeperId ||
      keeperId === archiveId ||
      archiveCandidates.has(keeperId)
    ) {
      continue; // keeper가 없거나·자기 자신이거나·함께 가려질 거면 가리지 않는다
    }
    byArchive.set(archiveId, keeperId);
  }
  return [...byArchive].map(([duplicate, keeper]) => ({ duplicate, keeper }));
}

// 비교 대상이 둘 미만(새 1개 + 후보 0개)이면 관계가 생길 수 없다 — LLM 콜을 생략한다.
export function canFormRelations(
  batchLength: number,
  candidateLength: number,
): boolean {
  return candidateLength > 0 || batchLength >= 2;
}

interface RelationChange {
  from_id: string;
  to_id: string;
  type: RelationType;
}

// 가릴 중복 → 남길 진술. RPC가 가릴 진술을 archive하며 duplicate_of=keeper를 박는다(NEM-162).
interface DuplicateChange {
  duplicate: string;
  keeper: string;
}

// 관계의 정체성 키 — 중복 판정의 단일 규칙. conflicts는 대칭이라 양끝을 정렬해
// 역방향(B→A)까지 같은 키로 collapse. gateProposals·dedupeChanges·교차 dedup이 공유한다.
function changeKey(change: RelationChange): string {
  return change.type === "conflicts"
    ? `conflicts:${[change.from_id, change.to_id].sort().join(":")}`
    : `${change.type}:${change.from_id}:${change.to_id}`;
}

// 게이트 (relation-design §5): 확신·비충돌만 조용히 applied. 충돌은 확신해도
// pending, 애매는 종류 무관 pending. 라벨을 id로 되돌리며 부적격 제안을 거른다.
export function gateProposals(params: {
  proposals: RelationProposal[];
  labelToId: Map<string, string>;
  batchIds: Set<string>;
}): { applied: RelationChange[]; pending: RelationChange[] } {
  const { proposals, labelToId, batchIds } = params;
  const applied: RelationChange[] = [];
  const pending: RelationChange[] = [];
  const seen = new Set<string>();

  for (const proposal of proposals) {
    const fromId = labelToId.get(proposal.from);
    const toId = labelToId.get(proposal.to);
    if (!fromId || !toId || fromId === toId) {
      continue; // 모르는 라벨이거나 자기 관계
    }
    // 적어도 한 끝점은 새 진술이어야 한다 — 기존↔기존은 이미 검사됨 (§5 scope)
    if (!batchIds.has(fromId) && !batchIds.has(toId)) {
      continue;
    }

    const change: RelationChange = {
      from_id: fromId,
      to_id: toId,
      type: proposal.type,
    };

    // 중복 제거 — 한 콜 안에서 같은 쌍은 첫 판정만 채택(applied XOR pending).
    const key = changeKey(change);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (proposal.confident && proposal.type !== "conflicts") {
      applied.push(change);
    } else {
      pending.push(change);
    }
  }

  return { applied, pending };
}

function callJudgment(llm: LlmProvider, message: string) {
  return llm.generateStructured({
    schema: RelationJudgmentSchema,
    schemaName: "relation_judgment",
    systemPrompt: RELATION_JUDGMENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    timeoutMs: LINKING_TIMEOUT_MS,
    maxRetries: 0,
  });
}

// 추출 청크 콜과 같은 재시도 정책 — 일시 오류(timeout/rate_limit/unknown)만,
// 시도 횟수 비례 지연. 결정적 실패는 source 단위 lease 사이클이 받는다.
async function callJudgmentWithRetry(llm: LlmProvider, message: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CHUNK_CALL_MAX_ATTEMPTS; attempt++) {
    try {
      return await callJudgment(llm, message);
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

async function applyRelationChangesets(params: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  applied: RelationChange[];
  pending: RelationChange[];
  duplicates: DuplicateChange[];
}): Promise<void> {
  const { supabase, sourceId, applied, pending, duplicates } = params;
  const { error } = await supabase.rpc("apply_relation_changesets", {
    p_source_id: sourceId,
    // RPC가 jsonb 배열로 받는다 — 구조체 배열을 Json으로 넘긴다. 여기서 TS의 필드명
    // 검증이 끊기고, 계약 상대는 apply_relation_changesets가 읽는 키다(applied/pending은
    // from_id/to_id/type, duplicates는 duplicate/keeper) — 키를 바꾸면 RPC도 함께 고친다.
    p_applied: applied as unknown as Json,
    p_pending: pending as unknown as Json,
    // 가릴 중복 → 남길 진술 쌍 — RPC가 archive + duplicate_of 세팅 (NEM-162)
    p_duplicates: duplicates as unknown as Json,
  });
  if (error) {
    throw new Error(
      `apply_relation_changesets failed for ${sourceId}: ${error.message}`,
    );
  }
}

async function fetchPendingLinkingSources(
  supabase: TypedSupabaseClient,
): Promise<PendingLinkingSource[]> {
  const { data, error } = await supabase.rpc("fetch_pending_linking_sources", {
    p_max_retries: MAX_RETRIES,
  });
  if (error) {
    throw new Error(`fetch_pending_linking_sources failed: ${error.message}`);
  }

  const parsed = z.array(PendingLinkingSourceSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new Error(
      `pending linking source validation failed: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

// 원본의 active 진술(새 배치) — 같은 글 형제는 여기서 다 모인다.
async function fetchSourceStatements(
  supabase: TypedSupabaseClient,
  sourceId: string,
): Promise<LinkingBatchStatement[]> {
  const { data, error } = await supabase
    .from("statements")
    .select(
      "id, content, type, confidence, ingestion_status, statement_sources!inner(source_id, locator)",
    )
    .eq("statement_sources.source_id", sourceId)
    .eq("status", "active");
  if (error) {
    throw new Error(
      `fetch source statements failed for ${sourceId}: ${error.message}`,
    );
  }

  const ordered = orderBySourceAppearance(data ?? []);

  const parsed = z.array(LinkingBatchStatementSchema).safeParse(ordered);
  if (!parsed.success) {
    throw new Error(`linking batch validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

// 원문 등장 순서(locator.index)로 정렬 — sub-batch가 원문 연속 구간이 되게 한다.
// 한 트랜잭션 생성이라 created_at이 모두 같아 순서는 locator에만 기댄다(꺼내기와 동일).
export function orderBySourceAppearance<
  T extends { statement_sources: Array<{ locator: unknown }> },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => sourceOrderIndex(a) - sourceOrderIndex(b));
}

// statement_sources의 locator {"index": n}에서 원문 순서를 뽑는다. !inner 필터로
// 이 source의 행만 임베드돼 첫 원소를 본다.
// ingestion 경로(apply_ingestion_changeset)는 진술마다 locator를 반드시 채우므로
// 정상 데이터는 여기 안 걸린다 — MAX_SAFE_INTEGER로 떨어지면(맨 뒤) 상류 불변식
// 위반 신호다. zod 밖이라 무신호로 정렬만 흐트러지니 의미를 코멘트로 남긴다.
function sourceOrderIndex(row: {
  statement_sources: Array<{ locator: unknown }>;
}): number {
  const locator = row.statement_sources[0]?.locator;
  if (locator && typeof locator === "object" && !Array.isArray(locator)) {
    const index = (locator as Record<string, unknown>)["index"];
    if (typeof index === "number") {
      return index;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

async function fetchCandidateStatements(
  supabase: TypedSupabaseClient,
  ids: string[],
): Promise<LinkingCandidateStatement[]> {
  const { data, error } = await supabase
    .from("statements")
    .select("id, content, type, confidence")
    .in("id", ids)
    .eq("status", "active");
  if (error) {
    throw new Error(`fetch candidate statements failed: ${error.message}`);
  }

  const parsed = z.array(LinkingCandidateStatementSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new Error(
      `linking candidate validation failed: ${parsed.error.message}`,
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

  const { error } = await runIncrementRpc({
    supabase,
    phase,
    id,
    errorMessage,
  });

  if (error) {
    Sentry.captureException(
      new Error(`increment retry failed for ${id}: ${error.message}`),
      { tags: { component: "statement-sync", phase } },
    );
  }
}

function runIncrementRpc(params: {
  supabase: TypedSupabaseClient;
  phase: Phase;
  id: string;
  errorMessage: string;
}) {
  const { supabase, phase, id, errorMessage } = params;
  switch (phase) {
    case "extraction":
      return supabase.rpc("increment_source_extraction_retry", {
        p_source_id: id,
        p_max_retries: MAX_RETRIES,
        p_error_message: errorMessage,
      });
    case "linking":
      return supabase.rpc("increment_source_linking_retry", {
        p_source_id: id,
        p_max_retries: MAX_RETRIES,
        p_error_message: errorMessage,
      });
    case "embedding":
      return supabase.rpc("increment_statement_ingestion_retry", {
        p_statement_id: id,
        p_max_retries: MAX_RETRIES,
        p_error_message: errorMessage,
      });
  }
}

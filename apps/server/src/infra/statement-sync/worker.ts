import { DateTime, IANAZone } from "luxon";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import {
  DIGEST_DESCRIPTION_MAX_LENGTH,
  DIGEST_EXTERNAL_URLS_MAX,
  DIGEST_TAGS_MAX,
  DIGEST_TITLE_MAX_LENGTH,
  DIGEST_TOPICS_MAX,
  DigestBodySchema,
  type DigestDraft,
  type DigestTagDraft,
  type DigestTopicDraft,
  type RelationType,
} from "@nema-io/shared";

import type { Json } from "@server/infra/database.types";
import type { EmbeddingProvider } from "@server/infra/embedding";
import {
  LlmError,
  resolveMaxRetries,
  RETRYABLE_LLM_CODES,
} from "@server/infra/llm/llm-error";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { LlmTask } from "@server/infra/llm/task-routing";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type {
  NeighborSearchOptions,
  StatementSearchHit,
  StatementUpsertItem,
  VectorStore,
} from "@server/infra/vector";
import {
  buildDigestExtractionMessage,
  DIGEST_EXTRACTION_SYSTEM_PROMPT,
  DIGEST_SOURCE_FIELD_KEYS,
} from "@server/prompts/digest-extraction";
import type {
  LabeledStatement,
  RelationProposal,
} from "@server/prompts/relation-judgment";
import {
  buildRelationJudgmentMessage,
  RELATION_JUDGMENT_SYSTEM_PROMPT,
  RelationJudgmentSchema,
} from "@server/prompts/relation-judgment";
import type { MergeDraftDigestInput } from "@server/prompts/relation-merge-draft";
import {
  buildRelationMergeDraftMessage,
  RELATION_MERGE_DRAFT_SYSTEM_PROMPT,
  RelationMergeDraftResponseSchema,
} from "@server/prompts/relation-merge-draft";
import type { ExtractedStatement } from "@server/prompts/statement-extraction";
import { StatementExtractionSchema } from "@server/prompts/statement-extraction";
import { resolveDeadlineToDueDate } from "@server/temporal/deadline";

import { buildDigestBody, runDigestionPass } from "./digestion";
import { limitLlmCall } from "./llm-limiter";
import type {
  LinkingBatchStatement,
  LinkingCandidateStatement,
  PendingLinkingSource,
  PendingSource,
  PendingStatement,
  SourceDigest,
} from "./types";
import {
  LinkingBatchStatementSchema,
  LinkingCandidateStatementSchema,
  PendingLinkingSourceSchema,
  PendingSourceSchema,
  PendingStatementSchema,
  SourceDigestSchema,
  TriggerMessageSchema,
  VectorPurgeMessageSchema,
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

// --- 벡터 정리 (purge 뒷정리) ---
const VECTOR_PURGE_BATCH_SIZE = 10;
const VECTOR_PURGE_VISIBILITY_TIMEOUT_SEC = 60;

// --- purge 워치독 (pg_cron이 조용히 멈춘 경우 감지) ---
const MS_PER_DAY = 86_400_000;
// 보관기간은 마이그레이션 purge_expired_sources의 기본값과 맞춘다 — 둘이 어긋나면
// 워치독이 헛경보하거나 지연을 놓친다.
const PURGE_RETENTION_DAYS = 30;
// 잡은 매일(03:00) 도므로 26시간 넘게 성공 기록이 없으면 한 사이클을 걸렀다는 신호.
const PURGE_JOB_STALE_HOURS = 26;
const PURGE_WATCHDOG_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
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
      // 워치독은 읽기 전용 count라 processing 게이트와 무관하게 자기 주기로 돈다.
      watchdogTimer = setInterval(() => {
        void checkPurgeBacklog(deps);
      }, PURGE_WATCHDOG_INTERVAL_MS);
      // 재기동 직후 1회 — 죽기 전에 ack까지 끝낸 notify의 잔여 pending을 줍는다
      current = sweep();
      void checkPurgeBacklog(deps);
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
      if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      if (current) {
        await current;
      }
      // eslint-disable-next-line no-console -- lifecycle log, no logger in worker context
      console.log("[statement-sync] stopped");
    },
  };
}

// 사이클: ⓪ 생성 → ① 추출 → ② 임베딩 → ③ 잇기, 넷 다 빌 때까지.
// ⓪은 리뷰 대기(open changeset)를 만들 뿐 ①의 입력을 직접 만들지 않는다 —
// ①은 사람이 리뷰를 확정해 원문이 active가 된 뒤에야 집는다(confirm이 notify를 쏨).
// ①이 pending 진술을, ②가 잇기 대상(임베딩 끝난 원문)을 만들어내므로 이 순서면
// 한 번 깨어난 김에 추출·임베딩·잇기까지 끝난다 (relation-design §3).
async function runCycle(deps: WorkerDeps): Promise<void> {
  while (true) {
    const digested = await runDigestionPass(deps);
    const extracted = await runExtractionPass(deps);
    const embedded = await runEmbeddingPass(deps);
    const linked = await runLinkingPass(deps);
    const purged = await runVectorPurgePass(deps);
    if (
      digested === 0 &&
      extracted === 0 &&
      embedded === 0 &&
      linked === 0 &&
      purged === 0
    ) {
      break;
    }
  }
}

// --- 벡터 정리: purge가 hard delete한 진술의 Qdrant 벡터를 지운다 ---
// purge RPC(pg_cron)가 vector_purge 큐에 넣은 진술 id를 드레인해 Qdrant에서 지운다.
// 임베딩 패스는 archived '행'을 읽어 벡터를 지우지만 purge는 행을 없애 그 경로가
// 못 보므로, hard delete된 벡터의 유일한 정리 경로다. delete-by-id라 행이 없어도 되고
// 멱등. 삭제 실패 시 ack하지 않아 visibility timeout 뒤 재전달로 재시도된다.
export async function runVectorPurgePass(deps: WorkerDeps): Promise<number> {
  let processed = 0;

  while (true) {
    const { data, error } = await deps.supabase.rpc(
      "read_vector_purge_events",
      {
        p_batch_size: VECTOR_PURGE_BATCH_SIZE,
        p_visibility_timeout: VECTOR_PURGE_VISIBILITY_TIMEOUT_SEC,
      },
    );
    if (error) {
      Sentry.captureMessage(
        `[statement-sync] vector_purge read error: ${error.message}`,
        {
          level: "error",
          tags: { component: "statement-sync", phase: "vector-purge" },
        },
      );
      break;
    }
    if (!data || !Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data) {
      const parsed = VectorPurgeMessageSchema.safeParse(row);
      if (!parsed.success) {
        // 발신자를 우리가 통제하므로 malformed는 사실상 버그 — ack해 영구 재전달만 막는다.
        Sentry.captureMessage(
          "[statement-sync] vector_purge message validation failed",
          {
            level: "error",
            tags: { component: "statement-sync", phase: "vector-purge" },
            extra: { validationError: parsed.error },
          },
        );
        const msgId = (row as { msg_id?: unknown })?.msg_id;
        if (typeof msgId === "number") {
          await ackVectorPurge(deps, msgId);
        }
        continue;
      }

      try {
        await deps.vectorStore.deleteStatements(
          parsed.data.message.statement_ids,
        );
      } catch (err) {
        Sentry.captureException(err, {
          tags: { component: "statement-sync", phase: "vector-purge" },
          extra: { statementIds: parsed.data.message.statement_ids },
        });
        continue; // ack 생략 → 재전달로 재시도
      }

      await ackVectorPurge(deps, parsed.data.msg_id);
      processed += 1;
    }

    if (data.length < VECTOR_PURGE_BATCH_SIZE) {
      break;
    }
  }

  return processed;
}

async function ackVectorPurge(deps: WorkerDeps, msgId: number): Promise<void> {
  const { error } = await deps.supabase.rpc("ack_vector_purge_event", {
    p_msg_id: msgId,
  });
  if (error) {
    Sentry.captureMessage(
      `[statement-sync] vector_purge ack failed: ${error.message}`,
      {
        level: "error",
        tags: { component: "statement-sync", phase: "vector-purge" },
        extra: { msgId },
      },
    );
  }
}

// pg_cron purge가 조용히 멈춘 경우를 잡는 워치독 — 보관기간+유예가 지났는데 아직
// trashed로 남은 원문이 있으면 잡이 안 도는 신호라 Sentry로 알린다("잡의 주인은 DB,
// 감시는 서버").
// 타이머가 fire-and-forget로 부르므로 절대 reject하지 않는다(poll/sweep과 같은 계약).
// pg_cron purge가 조용히 멈춘 경우를 잡는 워치독 — "밀린 개수"가 아니라 "잡이 최근에
// 실제로 성공했나"를 본다. 대량 휴지통을 배치 한도 때문에 여러 날 나눠 비우는 정상 상황엔
// backlog가 커도 헛경보하지 않고, 잡이 오래 안 돌았고(정지 의심) 실제로 만료된 원문이
// 남아 있을 때만 경고한다(빈 DB·신규 배포는 조용). fire-and-forget 타이머가 부르므로
// 절대 reject하지 않는다(poll/sweep과 같은 계약).
export async function checkPurgeBacklog(deps: WorkerDeps): Promise<void> {
  try {
    const { data: lastSuccess, error } = await deps.supabase.rpc(
      "purge_job_last_success",
    );
    if (error) {
      Sentry.captureException(
        new Error(`purge job health check failed: ${error.message}`),
        { tags: { component: "statement-sync", phase: "purge-watchdog" } },
      );
      return;
    }

    // 최근에 성공했으면 backlog 크기와 무관하게 정상 — 조용히 끝낸다.
    const staleMs = PURGE_JOB_STALE_HOURS * 60 * 60 * 1000;
    if (lastSuccess && Date.now() - Date.parse(lastSuccess) < staleMs) {
      return;
    }

    // 잡이 오래 안 돌았다 → 실제로 만료된 원문이 있을 때만 경고.
    const cutoff = new Date(
      Date.now() - PURGE_RETENTION_DAYS * MS_PER_DAY,
    ).toISOString();
    const { count, error: countError } = await deps.supabase
      .from("sources")
      .select("id", { count: "exact", head: true })
      .eq("status", "trashed")
      .lt("trashed_at", cutoff);
    if (countError) {
      Sentry.captureException(
        new Error(`purge backlog count failed: ${countError.message}`),
        { tags: { component: "statement-sync", phase: "purge-watchdog" } },
      );
      return;
    }

    if (count && count > 0) {
      Sentry.captureMessage(
        `[statement-sync] purge stalled: pg_cron 'purge-expired-sources' last succeeded ${lastSuccess ? lastSuccess : "never"}, ${count} expired source(s) still trashed`,
        {
          level: "warning",
          tags: { component: "statement-sync", phase: "purge-watchdog" },
          extra: { count, lastSuccess },
        },
      );
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "statement-sync", phase: "purge-watchdog" },
    });
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
              maxRetries: resolveMaxRetries(err, MAX_RETRIES),
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
export function deadlineContext(source: PendingSource): {
  reference: Date;
  timeZone: string;
  todayIsoDate: string;
} {
  const reference = new Date(source.created_at);

  let timeZone = "UTC";
  if (source.author_timezone !== null) {
    if (IANAZone.isValidZone(source.author_timezone)) {
      timeZone = source.author_timezone;
    } else {
      // null은 옛 글·미전달이라 의도된 침묵. 값이 있는데 무효면 클라이언트 버그라
      // 하루 어긋난 due_date를 낳으니 흔적을 남긴다.
      Sentry.captureMessage("source.author_timezone is not a valid IANA zone", {
        level: "warning",
        tags: { component: "statement-sync" },
        extra: {
          sourceId: source.id,
          authorTimezone: source.author_timezone,
        },
      });
    }
  }

  const todayIsoDate = DateTime.fromJSDate(reference, {
    zone: timeZone,
  }).toISODate();
  if (todayIsoDate === null) {
    // created_at은 DB가 보증하는 timestamptz라 사실상 도달 불가 — 도달하면 손상 신호.
    Sentry.captureMessage("could not derive note date from source.created_at", {
      level: "warning",
      tags: { component: "statement-sync" },
      extra: { sourceId: source.id, createdAt: source.created_at },
    });
    return { reference, timeZone, todayIsoDate: "" };
  }
  return { reference, timeZone, todayIsoDate };
}

// 추출된 진술 — RPC(apply_extraction_statements) 계약 형태. digest_id는 추출 근거,
// index는 원문 전체를 관통하는 등장 순서(digest 경계를 넘어 이어짐 — 잇기 정렬이 쓴다).
// object literal 타입(interface 아님) — Json으로의 암묵적 index signature 할당을 얻어
// RPC(p_statements: Json) 인자로 캐스트 없이 넘긴다.
type ExtractionStatement = {
  content: string;
  type: ExtractedStatement["type"];
  confidence: ExtractedStatement["confidence"];
  due_date: string | null;
  digest_id: string;
  index: number;
  source_field: ExtractedStatement["sourceField"];
  source_field_index: ExtractedStatement["sourceFieldIndex"];
};

async function processSource(
  source: PendingSource,
  deps: WorkerDeps,
): Promise<void> {
  const { reference, timeZone, todayIsoDate } = deadlineContext(source);
  const digests = await fetchSourceDigests(deps.supabase, source.id);

  // 추출 클레임된 원문은 pending digest가 ≥1 있어야 한다(첫 인제스천분 또는 수정으로 생긴
  // 새 digest). 0개면 상태 전이 이상 신호라 브레드크럼을 남긴다 — 아래 빈 apply가 source를
  // completed로 닫아 재시도에 갇히지 않게 한다.
  if (digests.length === 0) {
    Sentry.captureMessage("source pending extraction has no pending digests", {
      level: "warning",
      tags: { component: "statement-sync", phase: "extraction" },
      extra: { sourceId: source.id },
    });
  }

  // Digest들을 병렬 추출 — 입력이 루프 시작 시 전부 확정돼 있어 앞 콜을 기다릴 이유가 없다.
  // 순차로 돌리면 다digest 원문이 lease(150초)를 넘겨 완료 못 하고 재시도만 돌 수 있다.
  // 하나라도 실패하면 Promise.all의 첫 reject가 전파돼 source 전체가 재시도(부분 저장 없음) —
  // apply가 끝에 1회뿐이라 부분 적용이 없는 대가다(청크 원자성과 같은 결). 정합성 > 재실행 비용.
  const perDigest = await Promise.all(
    digests.map(async (digest) => ({
      digest,
      extracted: await extractDigestStatements(
        deps.forTask("extractStatements"),
        { digest, todayIsoDate },
      ),
    })),
  );

  // digest_id 태깅 + 원문 관통 index — Digest 인출 순서로 이어 붙여 잇기 정렬 계약을 지킨다.
  const statements: ExtractionStatement[] = [];
  for (const { digest, extracted } of perDigest) {
    for (const statement of normalizeStatements(extracted, {
      reference,
      timeZone,
    })) {
      statements.push({
        ...statement,
        digest_id: digest.id,
        index: statements.length,
      });
    }
  }

  // 진술이 0개여도 apply를 부른다 — 처리한 digest(진술 0개짜리 포함)를 completed로 닫고
  // source 클레임을 완료 표시한다(빈 statements면 진술·changeset append는 일어나지 않음).
  const { error } = await deps.supabase.rpc("apply_extraction_statements", {
    p_source_id: source.id,
    p_digest_ids: digests.map((digest) => digest.id),
    p_statements: statements,
  });
  if (error) {
    throw new Error(
      `apply_extraction_statements failed for ${source.id}: ${error.message}`,
    );
  }
}

// --- 추출 — Digest 1개당 LLM 1콜 (구조화 body는 짧아 청킹 불필요) ---

// 콜 한정 재시도 — digest 하나의 일시 실패가 성공한 다른 digest 콜을 버리게 하지 않도록
// 콜 레벨에서 먼저 막는다(source 단위 lease 재시도는 그 위 안전망). 잇기 판정 콜과 공유.
const LLM_CALL_MAX_ATTEMPTS = 3;
// rate_limit 직후 즉시 재시도는 또 걸린다 — 시도 횟수 비례 지연
const LLM_CALL_RETRY_DELAY_MS = 2_000;
// source 단위 lease 재시도(incrementRetry)와 기준을 공유한다 — llm-error.ts 참고.

// 일시 오류(timeout/rate_limit/unknown)만 시도 횟수 비례 지연으로 재시도하는 공용 정책 —
// 추출·관계 판정·병합 초안 등 모든 구조화 LLM 콜이 이 하나로 공유한다. 결정적 실패는
// 전파해 source 단위 lease 사이클이 받는다.
async function withLlmRetry<T>(call: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= LLM_CALL_MAX_ATTEMPTS; attempt++) {
    try {
      return await call();
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof LlmError && RETRYABLE_LLM_CODES.has(err.code);
      if (!retryable || attempt === LLM_CALL_MAX_ATTEMPTS) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * LLM_CALL_RETRY_DELAY_MS),
      );
    }
  }
  throw lastError;
}

async function extractDigestStatements(
  llm: LlmProvider,
  input: { digest: SourceDigest; todayIsoDate: string },
): Promise<ExtractedStatement[]> {
  const output = await limitLlmCall(() =>
    withLlmRetry(() => callDigestExtraction(llm, input)),
  );
  return output.statements;
}

function callDigestExtraction(
  llm: LlmProvider,
  input: { digest: SourceDigest; todayIsoDate: string },
) {
  return llm.generateStructured({
    schema: StatementExtractionSchema,
    schemaName: "statement_extraction",
    systemPrompt: DIGEST_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildDigestExtractionMessage(input.digest, {
          todayIsoDate: input.todayIsoDate,
        }),
      },
    ],
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    maxRetries: 0,
  });
}

// DB 제약(claim만 confidence)과 맞도록 방어 정규화 — 과장 금지 원칙이라 빠진 확신도는 guess.
// index·digest_id는 호출자가 원문 관통으로 부여한다(digest 경계를 넘어 이어지는 등장 순서).
function normalizeStatements(
  raw: ExtractedStatement[],
  context: { reference: Date; timeZone: string },
): Array<{
  content: string;
  type: ExtractedStatement["type"];
  confidence: ExtractedStatement["confidence"];
  due_date: string | null;
  source_field: ExtractedStatement["sourceField"];
  source_field_index: ExtractedStatement["sourceFieldIndex"];
}> {
  return raw.map((statement) => {
    // 기한 토큰을 작성 시점·존 기준 절대 날짜로. 기한 없거나 불량 토큰이면 null.
    const due_date = statement.deadline
      ? resolveDeadlineToDueDate(statement.deadline, context)
      : null;
    // 기한 토큰이 있는데 못 풀면(불완전·불가능·존 문제) 무음으로 떨구지 않고 흔적을 남긴다 —
    // 운영에서 기한이 조용히 사라지는 걸 관측 가능한 사건으로(deadline.ts는 순수라 여기서 잡는다).
    if (statement.deadline && due_date === null) {
      Sentry.captureMessage("deadline token did not resolve to a due_date", {
        level: "warning",
        tags: { component: "statement-sync" },
        extra: { deadline: statement.deadline },
      });
    }
    // sourceField는 LLM 자유 문자열이라 알려진 칸 이름과 다른 값(환각·오기)을 낼 수
    // 있다 — 그대로 저장하면 FE 하이라이트가 조용히 안 켜지는 것 말고는 아무 흔적도
    // 안 남는다. deadline과 같은 패턴으로 흔적을 남기고 null로 떨군다.
    let source_field = statement.sourceField ?? null;
    let source_field_index = statement.sourceFieldIndex ?? null;
    if (source_field !== null && !DIGEST_SOURCE_FIELD_KEYS.has(source_field)) {
      Sentry.captureMessage("sourceField did not match a known digest field", {
        level: "warning",
        tags: { component: "statement-sync" },
        extra: { sourceField: source_field },
      });
      source_field = null;
      source_field_index = null;
    }
    return {
      content: statement.content,
      type: statement.type,
      confidence:
        statement.type === "claim" ? (statement.confidence ?? "guess") : null,
      due_date,
      source_field,
      source_field_index,
    };
  });
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

// 추출 입력 = 원문의 확정 Digest들. 정렬은 (created_at, id) — 한 confirm에서 태어난
// digest들은 created_at이 같아 id가 타이브레이커다. 순서는 원문 관통 index의 뼈대라
// 결정적이면 충분하다(digest 사이 순서 자체는 판단 단위가 갈려 본질적으로 임의적).
async function fetchSourceDigests(
  supabase: TypedSupabaseClient,
  sourceId: string,
): Promise<SourceDigest[]> {
  const { data, error } = await supabase
    .from("digests")
    .select("id, title, description, body")
    .eq("source_id", sourceId)
    .eq("status", "active")
    // 아직 추출 안 된 digest만 — 이미 뽑은 형제(초기 인제스천분)나 다른 수정본은
    // extraction_status='completed'라 재추출 대상이 아니다(Digest 수정 시 새 digest만 pending).
    .eq("extraction_status", "pending")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    throw new Error(
      `fetch source digests failed for ${sourceId}: ${error.message}`,
    );
  }

  const parsed = z.array(SourceDigestSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new Error(`source digest validation failed: ${parsed.error.message}`);
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
          maxRetries: MAX_RETRIES,
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
              maxRetries: resolveMaxRetries(err, MAX_RETRIES),
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
  for (const subBatch of subBatches) {
    const result = await linkSubBatch({
      subBatch,
      spaceId: source.space_id,
      deps,
    });
    applied.push(...result.applied);
    pending.push(...result.pending);
  }

  // K개 sub-batch 결과를 모아 source당 1번 적용 — 되돌리기 단위는 글이라 applied 변경셋도
  // 글당 1개여야 한다(§6). 배치 0개(노이즈뿐)면 빈 적용으로 완료만.
  const { applied: finalApplied, pending: finalPending } = reconcileChanges(
    applied,
    pending,
  );
  const pendingWithDrafts = await attachMergeDrafts({
    pending: finalPending,
    sourceId: source.id,
    deps,
  });
  await applyRelationChangesets({
    supabase: deps.supabase,
    sourceId: source.id,
    applied: finalApplied,
    pending: pendingWithDrafts,
  });
}

// duplicates pending 쌍마다 병합 제안 Digest 초안을 즉시(eager) 만들어 붙인다
// (surface-inventory.md "관계 판정 화면(중복/병합)" — 판정 화면을 여는 순간 LLM을 부르면
// 이 파이프라인에서 유일한 로딩 상태가 생겨 일관성이 깨진다). 초안은 부가 기능이라
// 이것 때문에 원래 판정(확신 관계 적용 포함)까지 막히면 안 된다 — 스냅샷 조회 자체가
// 실패하면(손상된 digests.body 등) 초안 없이 기존 파이프라인을 그대로 흘려보내고,
// 개별 쌍의 LLM 호출만 실패하면 그 쌍만 draft 없이 남는다(둘 다 §conventions "개별
// 항목 오류는 전체를 막지 않는다"). draft 없는 pending은 apply_relation_changesets가
// 기존 "A vs B" 임시 제목으로 조용히 낮춘다.
async function attachMergeDrafts(params: {
  pending: RelationChange[];
  sourceId: string;
  deps: WorkerDeps;
}): Promise<RelationChange[]> {
  const { pending, sourceId, deps } = params;
  const duplicatePairs = pending.filter(
    (change) => change.type === "duplicates",
  );
  if (duplicatePairs.length === 0) {
    return pending;
  }

  let digestIdByStatement: Map<string, string>;
  let snapshotByDigest: Map<string, MergeDraftDigestSnapshot>;
  try {
    const statementIds = [
      ...new Set(
        duplicatePairs.flatMap((change) => [change.from_id, change.to_id]),
      ),
    ];
    digestIdByStatement = await fetchDigestIdsForStatements(
      deps.supabase,
      statementIds,
    );
    const digestIds = [...new Set(digestIdByStatement.values())];
    snapshotByDigest = await fetchMergeDraftSnapshots(deps.supabase, digestIds);
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        component: "statement-sync",
        phase: "linking",
        step: "merge-draft-snapshot",
      },
      extra: { sourceId },
    });
    return pending;
  }

  // 같은 Digest 쌍이 duplicates 진술 쌍 여러 개로 걸릴 수 있다 — 고유 쌍을 await 이전에
  // 동기적으로 먼저 추려야 LLM이 쌍당 정확히 한 번만 불린다. Promise.all(...map(async ...))
  // 콜백은 첫 await까지 동기 실행되므로, 이 dedupe를 async 콜백 안(첫 await 뒤)에 두면
  // 같은 쌍이 duplicate 진술 여러 개로 걸릴 때 전부 아직-없음을 보고 각자 LLM을 부른다.
  interface UniqueDigestPair {
    pairKey: string;
    keeper: MergeDraftDigestSnapshot;
    duplicate: MergeDraftDigestSnapshot;
  }
  const uniquePairs = new Map<string, UniqueDigestPair>();
  for (const change of duplicatePairs) {
    const keeperDigestId = digestIdByStatement.get(change.from_id);
    const duplicateDigestId = digestIdByStatement.get(change.to_id);
    const keeper = keeperDigestId
      ? snapshotByDigest.get(keeperDigestId)
      : undefined;
    const duplicate = duplicateDigestId
      ? snapshotByDigest.get(duplicateDigestId)
      : undefined;
    if (!keeper || !duplicate || keeper.id === duplicate.id) {
      continue;
    }
    const pairKey = [keeper.id, duplicate.id].sort().join(":");
    if (!uniquePairs.has(pairKey)) {
      uniquePairs.set(pairKey, { pairKey, keeper, duplicate });
    }
  }

  const draftByDigestPair = new Map<string, DigestDraft>();
  await Promise.all(
    [...uniquePairs.values()].map(async ({ pairKey, keeper, duplicate }) => {
      try {
        const draft = await generateMergeDraft({
          keeper,
          duplicate,
          llm: deps.forTask("draftRelationMerge"),
        });
        draftByDigestPair.set(pairKey, draft);
      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            component: "statement-sync",
            phase: "linking",
            step: "merge-draft",
          },
          extra: {
            sourceId,
            keeperDigestId: keeper.id,
            duplicateDigestId: duplicate.id,
          },
        });
      }
    }),
  );

  if (draftByDigestPair.size === 0) {
    return pending;
  }

  return pending.map((change) => {
    if (change.type !== "duplicates") {
      return change;
    }
    const keeperDigestId = digestIdByStatement.get(change.from_id);
    const duplicateDigestId = digestIdByStatement.get(change.to_id);
    if (!keeperDigestId || !duplicateDigestId) {
      return change;
    }
    const draft = draftByDigestPair.get(
      [keeperDigestId, duplicateDigestId].sort().join(":"),
    );
    return draft ? { ...change, merge_draft: draft } : change;
  });
}

async function fetchDigestIdsForStatements(
  supabase: TypedSupabaseClient,
  statementIds: string[],
): Promise<Map<string, string>> {
  if (statementIds.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("statements")
    .select("id, digest_id")
    .in("id", statementIds);
  if (error) {
    throw new Error(`fetch statement digest ids failed: ${error.message}`);
  }
  return new Map((data ?? []).map((row) => [row.id, row.digest_id]));
}

interface MergeDraftDigestSnapshot extends MergeDraftDigestInput {
  id: string;
  externalUrls: string[];
  topics: Array<{ id: string; title: string }>;
  tags: Array<{ id: string; title: string; description: string }>;
  referenceIds: string[];
}

// changeset-detail-service.ts의 fetchDigestSnapshots와 같은 조인이지만, 서비스 계층
// 함수를 워커(infra)가 직접 import하면 지금 레이어 구조(infra 위에 services, conventions.md
// "Infra clients isolate external dependencies")가 거꾸로 뒤집히므로 여기 따로 둔다.
async function fetchMergeDraftSnapshots(
  supabase: TypedSupabaseClient,
  digestIds: string[],
): Promise<Map<string, MergeDraftDigestSnapshot>> {
  if (digestIds.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("digests")
    .select(
      "id, title, description, body, external_urls, digest_topics(topic:topics(id, title)), digest_tags(tag:tags(id, title, description)), digest_references(reference_id)",
    )
    .in("id", digestIds);
  if (error) {
    throw new Error(`fetch merge draft snapshots failed: ${error.message}`);
  }

  const snapshots = new Map<string, MergeDraftDigestSnapshot>();
  for (const row of data ?? []) {
    const parsedBody = DigestBodySchema.safeParse(row.body);
    if (!parsedBody.success) {
      // 이 행 하나가 손상돼도 나머지 유효한 Digest들의 병합 초안까지 막으면 안 된다 —
      // 이 행만 스킵한다(attachMergeDrafts의 전체 실패 격리와 같은 원칙, 더 좁은 단위).
      Sentry.captureException(parsedBody.error, {
        tags: {
          component: "statement-sync",
          phase: "linking",
          step: "merge-draft-snapshot",
        },
        extra: { digestId: row.id },
      });
      continue;
    }
    snapshots.set(row.id, {
      id: row.id,
      title: row.title,
      description: row.description,
      body: parsedBody.data,
      externalUrls: row.external_urls ?? [],
      topics: row.digest_topics.map((dt) => ({
        id: dt.topic.id,
        title: dt.topic.title,
      })),
      tags: row.digest_tags.map((dt) => ({
        id: dt.tag.id,
        title: dt.tag.title,
        description: dt.tag.description,
      })),
      referenceIds: row.digest_references.map((dr) => dr.reference_id),
    });
  }
  return snapshots;
}

async function generateMergeDraft(params: {
  keeper: MergeDraftDigestSnapshot;
  duplicate: MergeDraftDigestSnapshot;
  llm: LlmProvider;
}): Promise<DigestDraft> {
  const { keeper, duplicate, llm } = params;
  const message = buildRelationMergeDraftMessage(keeper, duplicate);
  const { merged } = await limitLlmCall(() =>
    withLlmRetry(() => callMergeDraft(llm, message)),
  );

  return {
    title: merged.title.slice(0, DIGEST_TITLE_MAX_LENGTH),
    description: merged.description.slice(0, DIGEST_DESCRIPTION_MAX_LENGTH),
    body: buildDigestBody(merged),
    topics: unionTopics(keeper.topics, duplicate.topics),
    tags: unionTags(keeper.tags, duplicate.tags),
    referenceIds: unionStrings({
      a: keeper.referenceIds,
      b: duplicate.referenceIds,
    }),
    newReferenceKeys: [],
    externalUrls: unionStrings({
      a: keeper.externalUrls,
      b: duplicate.externalUrls,
      max: DIGEST_EXTERNAL_URLS_MAX,
    }),
  };
}

// topics·tags·referenceIds·externalUrls는 LLM이 새로 판단할 거리가 없는 순수 합집합
// (relation-merge-draft.ts 상단 주석 참고) — registryId 기준 dedupe.
export function unionTopics(
  a: MergeDraftDigestSnapshot["topics"],
  b: MergeDraftDigestSnapshot["topics"],
): DigestTopicDraft[] {
  const byId = new Map<string, DigestTopicDraft>();
  for (const topic of [...a, ...b]) {
    byId.set(topic.id, { registryId: topic.id, title: topic.title });
  }
  return [...byId.values()].slice(0, DIGEST_TOPICS_MAX);
}

export function unionTags(
  a: MergeDraftDigestSnapshot["tags"],
  b: MergeDraftDigestSnapshot["tags"],
): DigestTagDraft[] {
  const byId = new Map<string, DigestTagDraft>();
  for (const tag of [...a, ...b]) {
    byId.set(tag.id, {
      registryId: tag.id,
      title: tag.title,
      description: tag.description,
    });
  }
  return [...byId.values()].slice(0, DIGEST_TAGS_MAX);
}

export function unionStrings(params: {
  a: string[];
  b: string[];
  max?: number;
}): string[] {
  const merged = [...new Set([...params.a, ...params.b])];
  return params.max === undefined ? merged : merged.slice(0, params.max);
}

function callMergeDraft(llm: LlmProvider, message: string) {
  return llm.generateStructured({
    schema: RelationMergeDraftResponseSchema,
    schemaName: "relation_merge_draft",
    systemPrompt: RELATION_MERGE_DRAFT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    timeoutMs: LINKING_TIMEOUT_MS,
    maxRetries: 0,
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
    return { applied: [], pending: [] };
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
    withLlmRetry(() => callJudgment(deps.forTask("judgeRelations"), message)),
  );

  return gateProposals({
    proposals: output.relations,
    labelToId,
    batchIds: subBatchIds,
  });
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
  // conflicts 전용 — LLM 판정 콜(RelationProposal.conflictTitle)에서 그대로 옮겨온다.
  // 값이 있으면 apply_relation_changesets가 changeset.title로 쓰고, 없으면 "A vs B"로
  // 폴백한다(review-flow.md "Changeset 제목 자동 생성 (relation - 충돌)").
  conflict_title?: string;
  // duplicates 전용 — apply_relation_changesets RPC로 그대로 전달돼 changes.data에
  // 스냅샷되고, 있으면 changeset.title도 "A vs B" 대신 이 값의 title을 쓴다
  // (review-flow.md "Changeset 제목 자동 생성 (relation - 중복)").
  merge_draft?: DigestDraft;
}

// 관계의 정체성 키 — 중복 판정의 단일 규칙. conflicts·duplicates는 양끝을 정렬해
// 역방향(B→A)까지 같은 키로 collapse — conflicts는 대칭이라, duplicates는 같은 쌍의
// 방향만 뒤집힌 경쟁 제안(N0→N1, N1→N0)이 각각 별도 pending으로 올라와 둘째 승인이
// 끝점 검사에 걸려 날 에러를 뱉는 걸 막으려 한 쌍으로 접는다(저장 방향은 첫 제안대로).
// gateProposals·dedupeChanges·교차 dedup이 공유한다.
function changeKey(change: RelationChange): string {
  return change.type === "conflicts" || change.type === "duplicates"
    ? `${change.type}:${[change.from_id, change.to_id].sort().join(":")}`
    : `${change.type}:${change.from_id}:${change.to_id}`;
}

// 게이트 (relation-design §5): 확신·비충돌·비중복만 조용히 applied. 충돌·같음은 확신해도
// pending(진술을 잘못 엮거나 잘못 가리면 되돌리기 전엔 안 드러나 항상 사람 확인), 애매는
// 종류 무관 pending. 라벨을 id로 되돌리며 부적격 제안을 거른다.
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
    // 같음: 가릴 쪽(to)은 반드시 새 진술이어야 한다(하드 가드) — 새 글 투입으로 기존
    // 기록을 조용히 가리지 않는다. 방향이 뒤집혀 왔으면(to=기존) 통째로 버린다.
    if (proposal.type === "duplicates" && !batchIds.has(toId)) {
      continue;
    }

    const change: RelationChange = {
      from_id: fromId,
      to_id: toId,
      type: proposal.type,
      ...(proposal.type === "conflicts" && proposal.conflictTitle
        ? { conflict_title: proposal.conflictTitle }
        : {}),
    };

    // 중복 제거 — 한 콜 안에서 같은 쌍은 첫 판정만 채택(applied XOR pending).
    const key = changeKey(change);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (
      proposal.confident &&
      proposal.type !== "conflicts" &&
      proposal.type !== "duplicates"
    ) {
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
async function applyRelationChangesets(params: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  applied: RelationChange[];
  pending: RelationChange[];
}): Promise<void> {
  const { supabase, sourceId, applied, pending } = params;
  const { error } = await supabase.rpc("apply_relation_changesets", {
    p_source_id: sourceId,
    // RPC가 jsonb 배열로 받는다 — 구조체 배열을 Json으로 넘긴다. 여기서 TS의 필드명
    // 검증이 끊기고, 계약 상대는 apply_relation_changesets가 읽는 키(from_id/to_id/type,
    // conflicts면 conflict_title, duplicates면 merge_draft도)다 — 키를 바꾸면 RPC도 함께
    // 고친다. merge_draft는 RPC가 title 추출 외엔 그대로 changes.data에 얹기만 해 내부 키
    // casing(camelCase, DigestDraftSchema와 동일)은 SQL과 무관하다.
    p_applied: applied as unknown as Json,
    p_pending: pending as unknown as Json,
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

// 원문의 active 진술(새 배치) — 같은 글 형제는 여기서 다 모인다.
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
// 추출 경로(apply_extraction_statements)는 진술마다 locator를 반드시 채우므로
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
  params: {
    phase: Phase;
    id: string;
    errorMessage: string;
    maxRetries: number;
  },
): Promise<void> {
  const { phase, id, errorMessage, maxRetries } = params;

  const { error } = await runIncrementRpc({
    supabase,
    phase,
    id,
    errorMessage,
    maxRetries,
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
  maxRetries: number;
}) {
  const { supabase, phase, id, errorMessage, maxRetries } = params;
  switch (phase) {
    case "extraction":
      return supabase.rpc("increment_source_extraction_retry", {
        p_source_id: id,
        p_max_retries: maxRetries,
        p_error_message: errorMessage,
      });
    case "linking":
      return supabase.rpc("increment_source_linking_retry", {
        p_source_id: id,
        p_max_retries: maxRetries,
        p_error_message: errorMessage,
      });
    case "embedding":
      return supabase.rpc("increment_statement_ingestion_retry", {
        p_statement_id: id,
        p_max_retries: maxRetries,
        p_error_message: errorMessage,
      });
  }
}

import { createHash } from "node:crypto";

import type {
  ContentLanguage,
  Digest,
  DigestRelation,
  DigestWithRelations,
  SourceDeleteResult,
  SourceDraft,
  SourceGetResult,
  SourceIngestResult,
  SourceListWithDigestsCursor,
  SourceListWithDigestsResult,
  SourceWithDigests,
} from "@nema-io/shared";
import {
  DigestSchema,
  SourceDraftSchema,
  SourceGetResultSchema,
  SourceListWithDigestsResultSchema,
  SourceWithDigestsSchema,
} from "@nema-io/shared";

import { createLimiter } from "@server/infra/limiter";
import { getDigestGenerationProvider } from "@server/infra/llm/provider";
import { captureException } from "@server/infra/monitoring";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import {
  buildDigestGenerationMessage,
  buildDigestGenerationSystemPrompt,
  DigestGenerationSchema,
  flattenGeneratedDigests,
} from "@server/prompts/digest-generation";
import type { RequestOrigin } from "@server/request-origin";
import {
  deleteDigestVectors,
  indexDigests,
} from "@server/services/digest-index-service";
import {
  getRelationCounts,
  getRelationsForDigests,
  linkRelations,
} from "@server/services/digest-relation-service";
import { logGetSource } from "@server/services/mcp-tool-call-log-service";
import { getProfile } from "@server/services/profile-service";
import { RELATION_JUDGMENTS } from "@server/services/relation-rules";
import { SourceAlreadyProcessingError } from "@server/services/source-errors";

// DB 컬럼 기본값(profiles.content_language)과 같은 값으로 떨어뜨린다. 행이 없는
// 상태는 로그인은 했지만 온보딩 모달을 아직 못 끝낸 아주 좁은 틈뿐이라(모달이
// 강제라 넘어갈 수 없다), 그 순간을 위해 별도 오류 경로를 만들지 않는다.
const FALLBACK_CONTENT_LANGUAGE: ContentLanguage = "en";

// 타임아웃 후 재시도가 같은 원문을 또 처리하지 않게 하는 창. 던지기는 전 구간
// 동기라(LLM 여러 콜) 클라이언트가 응답을 못 받고 끊어도 서버는 끝까지 처리하고,
// 사용자는 실패로 보고 곧바로 다시 던진다 — 그 재시도가 이 창 안에 들어오면
// 새로 처리하지 않고 기존 결과를 그대로 돌려준다. 완전한 unique 제약은 안
// 쓴다 — 같은 내용을 의도적으로 다시 던지는 경우까지 영구히 막게 된다.
const INGEST_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

// processing 중복 판정 창은 훨씬 짧다 — 정상 처리는 수십 초 안에 끝난다. 이보다
// 오래 processing에 머문 행은 진행 중이 아니라 멈춘(크래시 등) 행일 가능성이
// 높아, completed와 같은 10분 창을 쓰면 멈춘 원문이 재시도를 최대 10분간 계속
// 막게 된다 — 그 대신 새로 처리하게 둔다(processIngestion이 성공하면 completed로,
// 실패하면 failed로 정리해 이 상태를 스스로 벗어난다).
const INGEST_PROCESSING_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export async function ingestSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  body: string;
}): Promise<SourceIngestResult> {
  const { supabase, userId, body } = args;

  const duplicate = await findRecentDuplicateSource({ supabase, userId, body });
  if (duplicate?.digestionStatus === "processing") {
    throw new SourceAlreadyProcessingError(duplicate.id);
  }
  if (duplicate) {
    // 10분 창·completed 조건이 실제로 맞는 값인지는 아직 근거가 얇다 — 얼마나
    // 자주 걸리는지가 그 근거가 될 유일한 신호라 서버 로그에 남긴다(mcp_tool_calls
    // 텔레메트리는 안 쓴다 — ingest는 원래 거기 안 남는다, mcp-tool-call-log-service.ts
    // 참고. 이 값들이 자리 잡으면 이 로그도 정리한다).
    console.warn(
      `[source-service] 중복 던지기로 재구성 — 새로 처리하지 않음, sourceId: ${duplicate.id}, userId: ${userId}`,
    );
    return reconstructIngestResult({ supabase, sourceId: duplicate.id });
  }

  const { data: source, error } = await supabase
    .from("sources")
    .insert({ user_id: userId, body })
    .select("id")
    .single();
  throwIfSupabaseError(error);

  // resolveContentLanguage도 withFailureRecovery 안에 둔다 — 밖에 두면(예:
  // getProfile의 DB 조회 자체가 실패) 이미 INSERT된 source 행이 failed로 정리될
  // 기회 없이 processing에 영구히 갇힌다.
  const digests = await withFailureRecovery({
    supabase,
    sourceId: source.id,
    work: async () => {
      const contentLanguage = await resolveContentLanguage({
        supabase,
        userId,
      });
      return extractAndSaveDigests({
        supabase,
        userId,
        sourceId: source.id,
        body,
        contentLanguage,
      });
    },
  });
  return { sourceId: source.id, digests };
}

// body_hash 생성 컬럼(마이그레이션)과 같은 함수·같은 입력이어야 같은 값이
// 나온다 — 한쪽만 바뀌면 아래 조회가 영영 안 걸린다.
function hashBody(body: string): string {
  return createHash("md5").update(body).digest("hex");
}

async function findRecentDuplicateSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  body: string;
}): Promise<{
  id: string;
  digestionStatus: "processing" | "completed";
} | null> {
  const { supabase, userId, body } = args;

  // failed는 여전히 제외한다 — 진짜로 끝난 실패는 중복이 아니라 새로 처리해야
  // 한다(재시도조차 안 되는 상태로 굳는 걸 막는다). processing/completed만
  // 후보로 두고, 그중 가장 최근 행 하나를 판정 대상으로 삼는다 — 같은
  // user_id+body_hash로 유효한 중복이 동시에 두 개 있을 수는 없다(있었다면
  // 앞선 중복 판정에서 새 행 자체가 안 생겼을 것이다).
  // v_visible_sources를 거치므로 그사이 휴지통에 간 원문은 안 걸린다(돌려줄
  // 결과가 이미 없다).
  // .returns<>()는 뷰의 생성 타입이 컬럼을 전부 nullable로 잡는 것을 되돌린다
  // (뷰 공통 관례) — id·digestion_status·created_at은 sources의 NOT NULL
  // 컬럼이라 WHERE로 거른 뒤엔 실제로 null일 수 없다.
  const { data, error } = await supabase
    .from("v_visible_sources")
    .select("id, digestion_status, created_at")
    .eq("user_id", userId)
    .eq("body_hash", hashBody(body))
    .in("digestion_status", ["processing", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<
      Array<{
        id: string;
        digestion_status: "processing" | "completed";
        created_at: string;
      }>
    >()
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!data) {
    return null;
  }

  const windowMs =
    data.digestion_status === "processing"
      ? INGEST_PROCESSING_DUPLICATE_WINDOW_MS
      : INGEST_DUPLICATE_WINDOW_MS;
  const isWithinWindow =
    Date.now() - new Date(data.created_at).getTime() < windowMs;
  if (!isWithinWindow) {
    return null;
  }

  return { id: data.id, digestionStatus: data.digestion_status };
}

// 중복 판정된 기존 원문의 결과를 처음 던졌을 때와 같은 모양으로 다시 만든다 —
// 응답이 화면 없이 결과를 보는 유일한 창구라(SourceIngestResultSchema 참고)
// 기존 결과를 그대로 재구성해 돌려준다.
async function reconstructIngestResult(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<SourceIngestResult> {
  const { supabase, sourceId } = args;

  const { data: rows, error } = await supabase
    .from("digests")
    .select("id, type, title, body, created_at")
    .eq("source_id", sourceId)
    .is("trashed_at", null)
    .order("extraction_order", { ascending: true });
  throwIfSupabaseError(error);

  const digests = (rows ?? []).map(toDigest);
  const relationsByDigestId = await getRelationsForDigests({
    supabase,
    digestIds: digests.map((digest) => digest.id),
  });

  return {
    sourceId,
    digests: digests.map((digest) => ({
      ...digest,
      relations: relationsByDigestId.get(digest.id) ?? [],
    })),
  };
}

export async function reExtractSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
}): Promise<SourceIngestResult> {
  const { supabase, userId, sourceId } = args;

  // RLS(owner-only)라 남의/없는 sourceId는 여기서 not-found로 걸린다.
  // v_visible_sources라 휴지통에 있는 원문도 not-found — 지운 원문을 되살리기
  // 전에 재추출할 길을 열어두지 않는다. .returns<>()는 뷰의 생성 타입이 컬럼을
  // 전부 nullable로 잡는 것을 되돌린다 — id·body는 sources의 NOT NULL 컬럼이라
  // WHERE로 거른 뒤엔 실제로 null일 수 없다.
  const { data: source, error: fetchError } = await supabase
    .from("v_visible_sources")
    .select("id, body")
    .eq("id", sourceId)
    .returns<Array<{ id: string; body: string }>>()
    .single();
  throwIfSupabaseError(fetchError);

  const contentLanguage = await resolveContentLanguage({ supabase, userId });

  // 상태 전환을 ingestSource와 대칭으로 맨 앞(LLM 호출 전)에 둔다 — 서버 상태는
  // 클릭 즉시 processing으로 바뀐다(화면 카드는 이 응답이 끝나 source.list가
  // 무효화돼야 그 결과를 반영한다 — DraftReExtractAction 참고). 실패하면 아래
  // withFailureRecovery가 failed로 되돌린다.
  //
  // WHERE에 digestion_status<>processing을 같이 걸어 동시 재추출을 막는다 —
  // 이미 processing인 원문에 걸면 이 UPDATE는 0행이라 updated가 비고, 그때
  // SourceAlreadyProcessingError를 던진다(ingestSource의 중복 판정과 같은 신호,
  // 같은 tRPC CONFLICT로 옮겨진다).
  const { data: updated, error: statusError } = await supabase
    .from("sources")
    .update({ digestion_status: "processing" })
    .eq("id", sourceId)
    .neq("digestion_status", "processing")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(statusError);
  if (!updated) {
    throw new SourceAlreadyProcessingError(sourceId);
  }

  const { digests, oldDigestIds } = await withFailureRecovery({
    supabase,
    sourceId,
    work: async () => {
      // LLM 호출을 기존 digest 삭제보다 먼저 한다 — 여기서 실패하면 기존
      // digest를 하나도 안 건드린 채 failed가 된다(재시도해도 결과가 그대로
      // 남는다). 새 digest를 성공보다 앞서 저장할 순 없다 — digests에
      // (source_id, extraction_order) unique 제약이 있어, 옛 digest가 아직
      // 있는 채로 같은 extraction_order(0부터)를 쓰는 새 digest를 못 넣는다.
      const { normalized, sourceTitle } = await generateDigests(
        source.body,
        contentLanguage,
      );

      // 지워지는 digest id를 같이 받아둔다 — 새 다이제스트를 색인한 뒤(아래)
      // 이 id들의 옛 벡터를 지운다. 순서가 반대면(새로 색인하기 전에 지우면)
      // 색인이 실패했을 때 검색 가능한 벡터가 하나도 안 남는 구간이 생긴다.
      const { data: oldDigestRows, error: deleteError } = await supabase
        .from("digests")
        .delete()
        .eq("source_id", sourceId)
        .select("id");
      throwIfSupabaseError(deleteError);

      const newDigests = await saveDigestsAndIndex({
        supabase,
        userId,
        sourceId: source.id,
        normalized,
        sourceTitle,
      });

      return {
        digests: newDigests,
        oldDigestIds: (oldDigestRows ?? []).map((row) => row.id),
      };
    },
  });

  await deleteDigestVectors(oldDigestIds);

  return { sourceId: source.id, digests };
}

// LLM 추출 → 저장/색인 묶음. ingestSource가 쓴다(reExtractSource는 그 사이에
// 기존 digest 삭제를 끼워야 해서 generateDigests/saveDigestsAndIndex를 직접 부른다).
async function extractAndSaveDigests(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
  body: string;
  contentLanguage: ContentLanguage;
}): Promise<DigestWithRelations[]> {
  const { supabase, userId, sourceId, body, contentLanguage } = args;
  const { normalized, sourceTitle } = await generateDigests(
    body,
    contentLanguage,
  );
  return saveDigestsAndIndex({
    supabase,
    userId,
    sourceId,
    normalized,
    sourceTitle,
  });
}

// saveDigestsAndIndex의 마지막 completed UPDATE 하나만 실패했을 때만 던진다 —
// 이 시점엔 digest 저장·색인이 이미 끝나 완전히 유효한 결과가 있다.
// withFailureRecovery는 이 타입을 다른 실패와 다르게 다룬다(아래).
class SourceCompletionUpdateFailedError extends Error {
  constructor(cause: unknown) {
    super(
      "digestion_status completed UPDATE failed after digests were saved and indexed.",
    );
    this.name = "SourceCompletionUpdateFailedError";
    this.cause = cause;
  }
}

// work 도중 실패하면 source를 failed로 표시하고 그대로 다시 던진다 —
// ingestSource·reExtractSource 둘 다 "처리 도중 실패하면 processing에 갇히지
// 않고 failed로 끝난다"를 똑같이 지켜야 해서 한 곳에 모은다. 딱 하나
// 예외다 — SourceCompletionUpdateFailedError는 안 건드린다. digest 저장·색인은
// 이미 끝난 유효한 결과라, failed로 덮어쓰면 재추출 버튼이 멀쩡한 digest를
// 지우고 처음부터 다시 만들게 된다(능동적 데이터 손실). processing에 그대로
// 남겨두는 쪽을 택한다 — 상태 불일치는 정합성 점검으로 별도로 다룬다
// (fix/draft-error-state 결정사항).
//
// work가 끝난 *뒤*의 후속 정리(예: reExtractSource의 기존 digest 삭제)는
// 일부러 이 안에 안 넣는다 — 그건 이미 완성된 결과에 딸린 뒷정리라 실패해도
// failed로 되돌릴 대상이 아니다.
async function withFailureRecovery<T>(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  work: () => Promise<T>;
}): Promise<T> {
  const { supabase, sourceId, work } = args;
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof SourceCompletionUpdateFailedError)) {
      await markSourceFailed({ supabase, sourceId });
    }
    throw error;
  }
}

async function markSourceFailed(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<void> {
  const { supabase, sourceId } = args;
  const { error } = await supabase
    .from("sources")
    .update({ digestion_status: "failed" })
    .eq("id", sourceId);
  if (error) {
    // 이 UPDATE마저 실패하면 source가 processing에 그대로 남는다 — DB 쓰기
    // 자체가 막힌 아주 드문 인프라 이슈라 자동 복구를 만들지 않는다
    // (fix/draft-error-state 결정사항). 발생하면 수동으로 상태를 바로잡는다.
    console.warn(
      `[source-service] 실패 상태 기록도 실패 — source가 processing에 멈춰 있을 수 있음, sourceId: ${sourceId}:`,
      error,
    );
  }
}

export async function deleteSource(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<SourceDeleteResult> {
  const { supabase, sourceId } = args;

  // trash_source는 digests 행을 안 건드린다(가시성은 조인으로 파생) — Qdrant는
  // 그 파생을 모르니 지금 보이는 digest id를 미리 받아둬야 벡터도 같이 지울 수
  // 있다. RLS라 남의 원문이면 이 조회도 빈 배열이라 안전하다.
  //
  // 이 조회가 실패하면 existingDigests는 undefined다 — "digest가 0개"와
  // 구분 못 하고 그냥 넘어가면 벡터 삭제가 조용히 스킵된다. purge가 CASCADE로
  // 지운 digest의 벡터를 더는 정리해주지 않는 지금 구조(source_purge 마이그레이션
  // 참고)에서는 이 스킵이 "나중에 복구 가능한 지연"이 아니라 "영구 고아"로
  // 남으므로 여기서는 조용히 넘어가지 않고 경고를 남긴다.
  const { data: existingDigests, error: existingDigestsError } = await supabase
    .from("v_visible_digests")
    .select("id")
    .eq("source_id", sourceId)
    .returns<Array<{ id: string }>>();
  if (existingDigestsError) {
    console.warn(
      `[source-service] 휴지통행 전 digest 목록 조회 실패 — 벡터 정리가 스킵될 수 있음, sourceId: ${sourceId}:`,
      existingDigestsError,
    );
  }

  // 이미 없는/남의/이미 trashed인 sourceId는 false — 에러가 아니다(RPC가
  // RAISE 대신 boolean을 반환하는 이유, source_digest_trash 마이그레이션 참고).
  const { data: trashed, error } = await supabase.rpc("trash_source", {
    p_source_id: sourceId,
  });
  throwIfSupabaseError(error);

  const deleted = trashed === true;
  if (deleted) {
    await deleteDigestVectors((existingDigests ?? []).map((row) => row.id));
  }

  return { success: deleted };
}

// 휴지통 화면이 없어(kickoff) 라우터엔 아직 안 붙는다 — digest-service.ts
// restoreDigest와 같은 사정.
export async function restoreSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
}): Promise<SourceDeleteResult> {
  const { supabase, userId, sourceId } = args;

  const { data: restored, error } = await supabase.rpc(
    "restore_trashed_source",
    { p_source_id: sourceId },
  );
  throwIfSupabaseError(error);

  const success = restored === true;
  if (success) {
    // 원문 휴지통행이 벡터만 지우고(위 deleteSource) digests 행은 안 건드렸듯,
    // 복원도 반대 방향으로 같은 자리를 메운다 — 다시 보이게 된 digest 전부를
    // 재색인한다. 부모는 방금 복원됐으니 이미 보인다(v_visible_digests를 다시
    // 조인할 필요 없이 digests.trashed_at만 보면 된다) — 단독으로 지워졌던
    // digest는 여전히 안 보여 재색인 대상에서 빠진다.
    const { data: digestRows, error: digestsError } = await supabase
      .from("digests")
      .select("id, type, title, body, created_at")
      .eq("source_id", sourceId)
      .is("trashed_at", null);
    throwIfSupabaseError(digestsError);
    // RPC는 이미 커밋됐다 — 여기서 던지면 사용자는 "복원 실패"로 보지만 DB는
    // 이미 복원된 상태로 갈린다(deleteDigestVectors와 반대 결). 재색인 실패는
    // 경고만 남기고 success:true를 그대로 돌려준다 — 검색 누락 하나가 "복원했는데
    // 실패로 보인다"는 혼란보다 낫다.
    try {
      await indexDigests({
        userId,
        digests: (digestRows ?? []).map(toDigest),
      });
    } catch (indexError) {
      console.warn(
        `[source-service] 복원 뒤 재색인 실패 — digest가 검색에 안 걸릴 수 있음, sourceId: ${sourceId}:`,
        indexError,
      );
    }
  }

  return { success };
}

// legacy(#432)와 같은 동시성 상한 — 개별 삭제가 벡터 삭제까지 포함해 순간
// 동시 요청이 몰리면 Qdrant/DB 커넥션을 과하게 잡아먹는다.
const SOURCE_DELETE_CONCURRENCY = 10;
const limitDelete = createLimiter(SOURCE_DELETE_CONCURRENCY);

interface SourceDeleteManyResult {
  failedCount: number;
}

// legacy와 달리 상태 충돌·열린 리뷰 같은 실패 갈래가 없다 — 이 아키텍처엔 그
// 개념(changeset, source_state_changed 등) 자체가 없어 성공/실패 둘로만 센다.
export async function deleteSources(args: {
  supabase: TypedSupabaseClient;
  sourceIds: string[];
}): Promise<SourceDeleteManyResult> {
  const { supabase, sourceIds } = args;

  const results = await Promise.allSettled(
    sourceIds.map((sourceId) =>
      limitDelete(() => deleteSource({ supabase, sourceId })),
    ),
  );

  const failedCount = results.filter(
    (result) => result.status === "rejected" || !result.value.success,
  ).length;

  return { failedCount };
}

export async function getSource(
  args: {
    supabase: TypedSupabaseClient;
    userId: string;
    origin: RequestOrigin;
    // 둘 다 받는 이유는 SourceGetInputSchema 참고.
  } & ({ sourcePublicId: string } | { sourceId: string }),
): Promise<SourceGetResult> {
  const { supabase, userId, origin } = args;

  // RLS(owner-only)라 남의/없는 값은 여기서 not-found로 걸린다. 휴지통에 있는
  // 원문도 v_visible_sources라 마찬가지다. .returns<>()는 뷰의 생성 타입이 컬럼을
  // 전부 nullable로 잡는 것을 되돌린다(뷰 공통 관례) — data.id를 아래 로그에
  // 그대로 쓰므로 여기서 null을 안고 넘어갈 수 없다.
  const query = supabase
    .from("v_visible_sources")
    .select("id, name, body, created_at");
  const { data, error } = await (
    "sourcePublicId" in args
      ? query.eq("public_id", args.sourcePublicId)
      : query.eq("id", args.sourceId)
  )
    .returns<
      Array<{ id: string; name: string; body: string; created_at: string }>
    >()
    .single();
  throwIfSupabaseError(error);

  // 이 로그는 "정리본으로 부족해 원문을 봤다"를 세는 MCP 전용 품질 지표다 —
  // 원문 상세 화면에서 사람이 직접 열어본 것까지 섞이면 지표 의미가 깨진다.
  // 로그 저장은 응답을 기다리게 하지 않는다 — 실패 격리뿐 아니라 지연도 격리한다.
  // 로그에는 내부 id를 남긴다 — public_id는 조회 입력일 뿐 지표가 참조하는 식별자가 아니다.
  if (origin === "mcp") {
    void logGetSource({ userId, detail: { sourceId: data.id } });
  }

  return SourceGetResultSchema.parse({
    sourceId: data.id,
    name: data.name,
    body: data.body,
    createdAt: data.created_at,
  });
}

// 초안 목록은 아직 진짜 페이지네이션이 없다 — 지금은 이 값 하나로 폭주만
// 막는다(legacy의 LIMIT 50과 같은 취지). 실사용 규모가 커지면 커서 기반
// 페이지네이션으로 바꿔야 한다(listSourcesWithDigests는 이미 옮겨갔다).
const SOURCE_LIST_SAFETY_LIMIT = 500;

export async function listSourcesWithDigests(args: {
  supabase: TypedSupabaseClient;
  cursor: SourceListWithDigestsCursor | null;
  limit: number;
}): Promise<SourceListWithDigestsResult> {
  const { supabase, cursor, limit } = args;

  // digests!inner로 다이제스트 행이 하나도 없는 원문을 걸러낸다 — 그건
  // listDraftSources(초안 화면) 몫이다. 가려진 행도 "행이 있다"에는 포함되므로
  // 다 가려도 원문 자체는 목록에 남는다(원문을 지울 진입점을 유지해야 해서).
  // digestion_status='completed' 조건은 listDraftSources와 겹치지 않게 막는
  // 안전장치다 — saveDigestsAndIndex가 digest 행을 커밋한 뒤 상태를 completed로
  // 바꾸는 마지막 UPDATE만 실패하면(드물지만) processing인데 digest 행은 있는
  // 원문이 생기고, 이 조건이 없으면 그 원문이 두 목록에 동시에 뜬다.
  let query = supabase
    .from("v_visible_sources")
    .select(
      "id, public_id, name, created_at, digests!inner(id, public_id, type, title, extraction_order, trashed_at)",
    )
    .eq("digestion_status", "completed")
    .order("created_at", { ascending: false })
    // id를 tie-breaker로 — created_at이 같은 원문이 있을 수 있어 정렬·커서
    // 비교 둘 다 (created_at, id) 튜플 기준이어야 경계가 안정적이다.
    .order("id", { ascending: false })
    .order("extraction_order", {
      referencedTable: "digests",
      ascending: true,
    })
    // 다음 페이지 존재 여부를 별도 count 쿼리 없이 알려고 하나 더 얹어 받는다
    // (legacy listChangesets와 같은 트릭).
    .limit(limit + 1);
  if (cursor) {
    // cursor는 SourceListWithDigestsCursorSchema(createdAt: datetime, id: uuid)를
    // 통과한 값만 여기 온다 — 콤마·괄호를 못 담는 포맷이라 아래 .or() 문자열
    // 조립이 PostgREST 필터 구문 인젝션에 안전하다.
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  throwIfSupabaseError(error);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows.at(-1);
  const nextCursor =
    hasMore && lastRow
      ? { createdAt: lastRow.created_at, id: lastRow.id }
      : null;

  const visibleDigestIds = pageRows.flatMap((row) =>
    row.digests
      .filter((digest) => digest.trashed_at === null)
      .map((digest) => digest.id),
  );
  // 실패해도 폴백(예: relationCount: 0)으로 넘기지 않고 그대로 던진다 — 조회가
  // 반쯤 실패한 채로 0을 채우면 "관계가 실제로 있는데 0개로 보이는" 조용히
  // 틀리는 종류의 버그가 된다(킥오프가 명시적으로 경계한 것). 목록 전체가
  // 잠깐 실패하는 게 개수를 거짓으로 보여주는 것보다 낫다.
  const relationCountById = await getRelationCounts({
    supabase,
    digestIds: visibleDigestIds,
  });

  // items뿐 아니라 nextCursor(DB row를 그대로 담음)까지 함께 검증한다 —
  // 어긋나면 다음 스크롤이 원인 불명 에러를 내는 대신 여기서 바로 던진다.
  return SourceListWithDigestsResultSchema.parse({
    items: pageRows.map((row) => toSourceWithDigests(row, relationCountById)),
    nextCursor,
  });
}

export async function listDraftSources(args: {
  supabase: TypedSupabaseClient;
}): Promise<SourceDraft[]> {
  const { supabase } = args;

  // 필터(failed 또는 digests 0건 — processing은 뺀다)는 v_draft_sources 뷰가
  // DB에서 미리 건다 — 여기서 JS로 걸렀다면 상한(limit)이 거르기 전에 먼저
  // 잘라, 원문이 많을 때 실제로 있는 초안이 빈 목록으로 보일 수 있었다(에러
  // 없이 조용히 틀림).
  const { data, error } = await supabase
    .from("v_draft_sources")
    .select("id, public_id, name, body_preview, created_at, digestion_status")
    .order("created_at", { ascending: false })
    .limit(SOURCE_LIST_SAFETY_LIMIT);
  throwIfSupabaseError(error);

  return (data ?? []).map(toSourceDraft);
}

// v_visible_sources 컬럼은 생성 타입에서 전부 nullable로 잡힌다(뷰 공통 —
// v_draft_sources와 같은 사정, 아래 toSourceDraft 주석 참고). 실제로 null이 나올
// 일은 없고 SourceWithDigestsSchema.parse가 그 전제를 지킨다.
type SourceWithDigestsRow = Pick<
  Database["public"]["Views"]["v_visible_sources"]["Row"],
  "id" | "public_id" | "name" | "created_at"
> & {
  digests: Array<
    Pick<
      Database["public"]["Tables"]["digests"]["Row"],
      "id" | "public_id" | "type" | "title" | "trashed_at"
    >
  >;
};

function toSourceWithDigests(
  row: SourceWithDigestsRow,
  relationCountById: Map<string, number>,
): SourceWithDigests {
  return SourceWithDigestsSchema.parse({
    sourceId: row.id,
    publicId: row.public_id,
    name: row.name,
    createdAt: row.created_at,
    digests: row.digests
      .filter((digest) => digest.trashed_at === null)
      .map((digest) => ({
        id: digest.id,
        publicId: digest.public_id,
        type: digest.type,
        title: digest.title,
        relationCount: relationCountById.get(digest.id) ?? 0,
      })),
  });
}

// 뷰(v_draft_sources)의 생성 타입은 컬럼을 전부 nullable로 잡는다 — 밑 테이블
// (sources)에는 전부 NOT NULL 컬럼이라 실제로 null이 나올 일은 없다. 그래도
// round-trip을 실제로 검증하는 SourceDraftSchema.parse가 이 전제를 지킨다:
// 어긋나면(예: 뷰 정의가 조인으로 바뀌어 실제로 null이 새면) 여기서 곧바로 던진다.
type SourceDraftRow = Pick<
  Database["public"]["Views"]["v_draft_sources"]["Row"],
  | "id"
  | "public_id"
  | "name"
  | "body_preview"
  | "created_at"
  | "digestion_status"
>;

function toSourceDraft(row: SourceDraftRow): SourceDraft {
  return SourceDraftSchema.parse({
    sourceId: row.id,
    publicId: row.public_id,
    name: row.name,
    bodyPreview: row.body_preview,
    createdAt: row.created_at,
    status: row.digestion_status,
  });
}

async function resolveContentLanguage(args: {
  supabase: TypedSupabaseClient;
  userId: string;
}): Promise<ContentLanguage> {
  const profile = await getProfile(args);
  if (!profile) {
    // 이 틈이 실제로 좁은지는 "온보딩 모달이 유일한 진입 경로"라는 전제에
    // 달려 있다 — 그 전제가 깨지면(레이스, 온보딩을 안 거치는 새 진입점 등)
    // 조용히 en으로만 떨어지지 않고 신호가 남게 한다.
    console.warn(
      `[content-language] 프로필 행 없음, 기본값(${FALLBACK_CONTENT_LANGUAGE})으로 대체 — userId: ${args.userId}`,
    );
  }
  return profile?.contentLanguage ?? FALLBACK_CONTENT_LANGUAGE;
}

async function generateDigests(
  body: string,
  contentLanguage: ContentLanguage,
): Promise<{
  normalized: Array<Pick<Digest, "type" | "title" | "body">>;
  sourceTitle: string;
}> {
  const generated = await getDigestGenerationProvider().generateStructured({
    systemPrompt: buildDigestGenerationSystemPrompt(contentLanguage),
    messages: [{ role: "user", content: buildDigestGenerationMessage(body) }],
    schema: DigestGenerationSchema,
  });
  return {
    normalized: flattenGeneratedDigests(generated),
    sourceTitle: generated.sourceTitle,
  };
}

async function saveDigestsAndIndex(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
  normalized: Array<Pick<Digest, "type" | "title" | "body">>;
  sourceTitle: string;
}): Promise<DigestWithRelations[]> {
  const { supabase, userId, sourceId, normalized, sourceTitle } = args;

  const digests =
    normalized.length === 0
      ? []
      : await saveDigests({ supabase, sourceId, normalized });

  // 다이제스트 저장 직후, 같은 흐름 안에서 동기로 색인한다 — 실패하면 던지기
  // 전체가 실패한다. 이미 커밋된 digest 행은 색인 실패와 함께 되돌린다 — 안 그러면
  // Postgres엔 있지만 Qdrant엔 없어 영영 안 걸리는 다이제스트가 조용히 남는다.
  // 이 예외는 withFailureRecovery까지 그대로 올라가 source를 failed로 남긴다.
  try {
    await indexDigests({ userId, digests });
  } catch (indexError) {
    if (digests.length > 0) {
      const { error: rollbackError } = await supabase
        .from("digests")
        .delete()
        .in(
          "id",
          digests.map((digest) => digest.id),
        );
      if (rollbackError) {
        console.warn(
          "[source-service] 색인 실패 후 digest 롤백도 실패 — 고아 행이 남을 수 있음:",
          rollbackError,
        );
      }
    }
    throw indexError;
  }

  const { error: statusError } = await supabase
    .from("sources")
    .update({ digestion_status: "completed", title: sourceTitle })
    .eq("id", sourceId);
  if (statusError) {
    // 여기서 던지는 예외는 SourceCompletionUpdateFailedError로 감싼다 —
    // withFailureRecovery가 이 타입만은 failed로 안 덮어쓴다(위 정의 참고).
    throw new SourceCompletionUpdateFailedError(statusError);
  }

  // 색인 다음에 잇는다 — 후보를 방금 색인한 벡터로 찾기 때문에 순서를 바꿀 수 없다.
  const relationsByDigestId = await linkAllRelations({
    supabase,
    userId,
    sourceId,
    digests,
  });

  return digests.map((digest) => ({
    ...digest,
    relations: relationsByDigestId.get(digest.id) ?? [],
  }));
}

// 갈래를 RELATION_JUDGMENTS 순서대로 하나씩 돈다 — 그 순서가 뜻을 갖는 이유는
// relation-rules.ts에 적혀 있다. 병렬로 바꾸면 조용히 깨진다.
//
// 관계 잇기는 실패해도 안 던진다: 관계는 아무것도 접지 않아 없어도 다이제스트는
// 온전하고, 여기서 던지면 이미 저장된 정리 결과까지 사용자가 잃는다. 갈래 하나가
// 통째로 실패해도 다른 갈래가 이은 것은 남긴다.
async function linkAllRelations(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
  digests: Digest[];
}): Promise<Map<string, DigestRelation[]>> {
  const { supabase, userId, sourceId, digests } = args;
  const merged = new Map<string, DigestRelation[]>();

  for (const judgment of RELATION_JUDGMENTS) {
    const linked = await linkRelations({
      supabase,
      userId,
      sourceId,
      digests,
      judgment,
    }).catch((error: unknown) => {
      console.warn(
        `[source-service] 관계 잇기 실패 — 다이제스트는 그대로 둔다, sourceId: ${sourceId}, judgment: ${judgment.name}:`,
        error,
      );
      // 사용자에게는 던지기가 정상 완료로 보여 이 실패를 스스로 알아챌 방법이
      // 없다 — sourceId·judgment를 태그로 실어 재추출 대상을 바로 특정하게 한다.
      captureException(error, {
        tags: { sourceId, judgment: judgment.name },
      });
      return new Map<string, DigestRelation[]>();
    });

    for (const [digestId, relations] of linked) {
      merged.set(digestId, [...(merged.get(digestId) ?? []), ...relations]);
    }
  }

  return merged;
}

async function saveDigests(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  normalized: Array<Pick<Digest, "type" | "title" | "body">>;
}): Promise<Digest[]> {
  const { supabase, sourceId, normalized } = args;

  const { data: rows, error } = await supabase
    .from("digests")
    .insert(
      // LLM 응답 배열의 순서가 곧 원문 안에서의 추출 순서다 — 배열 인덱스를
      // 그대로 extraction_order에 넣는다.
      normalized.map((digest, index) => ({
        source_id: sourceId,
        type: digest.type,
        title: digest.title,
        body: digest.body,
        extraction_order: index,
      })),
    )
    .select("id, type, title, body, created_at");
  throwIfSupabaseError(error);

  return (rows ?? []).map(toDigest);
}

type DigestRow = Pick<
  Database["public"]["Tables"]["digests"]["Row"],
  "id" | "type" | "title" | "body" | "created_at"
>;

// DB round-trip 결과를 판별 유니언으로 단언하지 않고 실제로 검증한다 — 오늘은
// saveDigests(정규화된 값만 넣음)가 유일한 쓰기 경로라 안전하지만, 이 변환기가
// 나중에 조회 라우터에서 재사용되면 라우터에 .output() 스키마가 없는 한 이 자리가
// DB→API 응답 경계의 유일한 방어선이 된다.
function toDigest(row: DigestRow): Digest {
  return DigestSchema.parse({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  });
}

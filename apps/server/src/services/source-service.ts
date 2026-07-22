import * as Sentry from "@sentry/node";

import { SOURCE_TITLE_MAX_LENGTH } from "@nema-io/shared";

import type { Database } from "@server/infra/database.types";
import { createLimiter } from "@server/infra/llm/limiter";
import type { Providers } from "@server/infra/providers";
import { abortDigestion } from "@server/infra/statement-sync";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  SupabaseError,
  throwIfSupabaseError,
} from "@server/infra/supabase-error";
import {
  buildSourceTitleMessage,
  SOURCE_TITLE_SYSTEM_PROMPT,
} from "@server/prompts/source-title";
import { parseLocatorIndex } from "@server/services/statement-search";

type ExtractionStatus = Database["public"]["Enums"]["ingestion_status"];
type DigestionStatus = Database["public"]["Enums"]["digestion_status"];

// 박제까지만 동기 — 추출·임베딩은 statement-sync 워커가 이어받고, 제목은 여기서 띄운
// 콜이 뒤에서 채운다(응답을 안 붙잡는다).
// 응답은 source_id 하나. 화면은 이 id로 처리 상태를 추적한다 (ingestion-design 2장).
export async function createSource(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  body: string;
  sessionId?: string;
  spaceId?: string;
  timeZone?: string;
}): Promise<{ sourceId: string }> {
  const { supabase, providers, body, sessionId, spaceId, timeZone } = args;

  // spaceId 미지정 호출(MCP·dev-harness)만 이 경로를 탄다 — 1인 단계엔 가입
  // 트리거가 만든 개인 Space 1개뿐이라(RLS로 내 멤버십만 보임) 가장 오래된
  // 것이 곧 그 개인 칸이다. RPC가 SECURITY DEFINER라 소유 검증은 RPC 몫.
  let targetSpaceId = spaceId;
  if (targetSpaceId === undefined) {
    const { data: membership, error: memberError } = await supabase
      .from("space_members")
      .select("space_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    throwIfSupabaseError(memberError);
    targetSpaceId = membership.space_id;
  }

  const { data: sourceId, error } = await supabase.rpc("create_source", {
    p_space_id: targetSpaceId,
    p_body: body,
    ...(sessionId !== undefined && { p_session_id: sessionId }),
    ...(timeZone !== undefined && { p_author_timezone: timeZone }),
  });
  throwIfSupabaseError(error);

  fillSourceTitle({ supabase, providers, sourceId, body });

  return { sourceId };
}

const SOURCE_LIST_LIMIT = 50;

interface SourceSummary {
  id: string;
  body: string;
  extractionStatus: ExtractionStatus;
  errorMessage: string | null;
  createdAt: string;
  statementCount: number;
}

// 내 Space의 원본 목록(작성자 무관) — 격리는 RLS(Space 멤버십)가 담당한다
export async function listSources(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ sources: SourceSummary[] }> {
  const { supabase } = args;

  const { data: sourceRows, error } = await supabase
    .from("sources")
    .select("id, body, extraction_status, error_message, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(SOURCE_LIST_LIMIT);
  throwIfSupabaseError(error);

  const sources = sourceRows ?? [];
  if (sources.length === 0) {
    return { sources: [] };
  }

  const { data: statementRefs, error: countError } = await supabase
    .from("statement_sources")
    .select("source_id, statements!inner(id)")
    .in(
      "source_id",
      sources.map((s) => s.id),
    )
    .eq("statements.status", "active");
  throwIfSupabaseError(countError);

  const countBySourceId = new Map<string, number>();
  for (const ref of statementRefs ?? []) {
    countBySourceId.set(
      ref.source_id,
      (countBySourceId.get(ref.source_id) ?? 0) + 1,
    );
  }

  return {
    sources: sources.map((row) => ({
      id: row.id,
      body: row.body,
      extractionStatus: row.extraction_status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      statementCount: countBySourceId.get(row.id) ?? 0,
    })),
  };
}

const PENDING_SOURCE_LIST_LIMIT = 50;

// digestion_status 원본 값 + "그 리뷰가 버려졌는가"를 서버가 미리 조합해 내려주는 단일
// 값 — 소비처(특히 타입 체커 없이 JSON을 그대로 읽는 MCP)가 두 신호를 각자 조합하다
// 놓치는 사고를 구조적으로 막는다(경위는 design-decisions-log.md 2026-07-17 참고).
type DigestionOutcome =
  | "processing"
  | "failed"
  | "cancelled"
  | "empty"
  | "discarded";

function toDigestionOutcome(args: {
  digestionStatus: DigestionStatus;
  hasDiscardedReview: boolean;
}): DigestionOutcome {
  switch (args.digestionStatus) {
    case "pending":
      return "processing";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "completed":
      return args.hasDiscardedReview ? "discarded" : "empty";
  }
}

// lastDigestionAttempt는 워커가 큐에서 집어드는 시점에 찍힌다(완료 시각이 아니다)
// — 그래서 이 비교의 의미는 "마지막 정리가 시작된 뒤에 입력이 바뀌었나"이고, 정리
// 도중의 편집도 바뀐 것으로 잡힌다. 그 편집은 지금 도는 정리에 반영될 수 없으니
// 맞는 판정이다. 스탬핑 시점을 완료 시각으로 옮기면 이 성질이 조용히 깨진다.
function hasInputChangedSinceDigestion(args: {
  digestionInputUpdatedAt: string;
  lastDigestionAttempt: string | null;
}): boolean {
  // 비교할 시도 시각이 없으면 열어준다. 이 게이트는 사용자의 재정리를 막는
  // 방향이라 판정 불가는 막는 쪽이 아니라 푸는 쪽이어야 한다 — 잘못 열리면
  // 헛수고 한 번이지만 잘못 잠기면 영영 재정리할 수 없다. 실제로 v1 파이프라인
  // 시절 원본은 digestion_status만 completed로 소급되고 시도 시각은 NULL로 남아
  // (20260707100000), 잠그면 그 초안들이 영구히 묶인다.
  if (args.lastDigestionAttempt === null) {
    return true;
  }
  return (
    new Date(args.digestionInputUpdatedAt).getTime() >
    new Date(args.lastDigestionAttempt).getTime()
  );
}

interface PendingSourceItem {
  sourceId: string;
  spaceId: string;
  body: string;
  title: string | null;
  createdAt: string;
  digestionOutcome: DigestionOutcome;
  // web은 이제 이 값을 안 쓴다(정리중 경과 시간은 digestionStartedAt) — 그래도
  // MCP(list_pending_sources)를 포함해 워커가 마지막으로 언제 집어갔는지 원시값을
  // 보고 싶은 소비처를 위해 계약에 남겨둔다.
  lastDigestionAttempt: string | null;
  // 사용자가 "기억하기"를 누른 시점 — lastDigestionAttempt는 워커가 집어들거나
  // 재시도할 때마다 now()로 갱신되므로(hasInputChangedSinceDigestion이 그 성질에
  // 기댄다) 화면의 "정리중.." 경과 시간엔 못 쓴다. 재시도 없이 start_source_digestion
  // 에서만 찍히는 값을 따로 내려준다(아직 한 번도 정리를 시작 안 했으면 null).
  digestionStartedAt: string | null;
  // 마지막 정리 이후 정리 입력(본문·Space)이 바뀌었는지 — "원본을 안 고치고 다시
  // 정리해봐야 같은 결과"라는 판정에 쓴다. 두 시각을 소비처가 각자 비교하면 그 규칙이
  // 화면마다 흩어지므로 digestionOutcome과 같은 이유로 서버가 조합해 내려준다.
  inputChangedSinceDigestion: boolean;
  errorMessage: string | null;
  // 생성이 끝나 리뷰가 열렸으면 그 pending ingestion changeset(상세 URL이 number
  // 기준이라 changesetNumber도 함께 내려준다). 아직이면 null — 소비자가 "생성 중"과
  // "리뷰 준비됨"을 가르는 단일 신호다. 제품에선 이 둘이 각각 초안 목록과 변경셋
  // 대기 탭으로 갈리지만, 그 분리는 화면 층의 몫이다.
  review: { changesetId: string; changesetNumber: number } | null;
  digestCount: number;
}

// pending 원본 목록 — 파생 없는 상태(갓 생성·생성 중·되돌려진 것). web(초안 목록)과
// MCP(list_pending_sources)가 함께 읽는다. RLS가 Space 격리.
export async function listPendingSources(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ items: PendingSourceItem[] }> {
  const { supabase } = args;

  const { data: sources, error } = await supabase
    .from("sources")
    .select(
      "id, space_id, body, title, created_at, digestion_status, last_digestion_attempt, digestion_started_at, digestion_input_updated_at, error_message",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(PENDING_SOURCE_LIST_LIMIT);
  throwIfSupabaseError(error);

  const sourceIds = (sources ?? []).map((source) => source.id);
  if (sourceIds.length === 0) {
    return { items: [] };
  }

  const { data: changesets, error: changesetError } = await supabase
    .from("changesets")
    .select("id, number, source_id, status, changes(target_type)")
    .eq("type", "ingestion")
    .in("status", ["pending", "rejected"])
    .in("source_id", sourceIds);
  throwIfSupabaseError(changesetError);

  const reviewBySource = new Map<
    string,
    { changesetId: string; changesetNumber: number; digestCount: number }
  >();
  // 존재 여부만 볼 뿐 시점은 안 따진다 — 버림 후 원본을 고쳐 재시도해도 그 원본은
  // 계속 discardedSourceIds에 남는다(design-decisions-log.md 2026-07-17 "정확도
  // 범위를 의도적으로 좁힘" 참고, 의도된 트레이드오프).
  const discardedSourceIds = new Set<string>();
  for (const changeset of changesets ?? []) {
    if (changeset.source_id === null) {
      continue;
    }
    // number가 null인 pending changeset은 트리거가 아직 번호를 못 붙인 것이라
    // changesetId/changesetNumber를 함께 요구하는 이 계약상 아직 "리뷰 준비됨"으로
    // 볼 수 없다 — 리뷰 없음과 동일하게 취급한다.
    if (changeset.status === "pending" && changeset.number !== null) {
      reviewBySource.set(changeset.source_id, {
        changesetId: changeset.id,
        changesetNumber: changeset.number,
        digestCount: changeset.changes.filter(
          (change) => change.target_type === "digest",
        ).length,
      });
    } else if (changeset.status === "rejected") {
      discardedSourceIds.add(changeset.source_id);
    }
  }

  return {
    items: (sources ?? []).map((source) => {
      const review = reviewBySource.get(source.id);
      return {
        sourceId: source.id,
        spaceId: source.space_id,
        body: source.body,
        title: source.title,
        createdAt: source.created_at,
        digestionOutcome: toDigestionOutcome({
          digestionStatus: source.digestion_status,
          hasDiscardedReview: discardedSourceIds.has(source.id),
        }),
        lastDigestionAttempt: source.last_digestion_attempt,
        digestionStartedAt: source.digestion_started_at,
        inputChangedSinceDigestion: hasInputChangedSinceDigestion({
          digestionInputUpdatedAt: source.digestion_input_updated_at,
          lastDigestionAttempt: source.last_digestion_attempt,
        }),
        errorMessage: source.error_message,
        review: review
          ? {
              changesetId: review.changesetId,
              changesetNumber: review.changesetNumber,
            }
          : null,
        digestCount: review?.digestCount ?? 0,
      };
    }),
  };
}

// --- 초안 액션 (intake-flow "초안 관리") ---
// 셋 다 상태 판정을 RPC의 WHERE 가드에 맡긴다 — 서비스가 먼저 조회해 상태를 확인하고
// 분기하면 그 사이 워커가 상태를 바꿔(2초 폴링) 판정이 낡는다. 가드를 UPDATE와 한
// 트랜잭션에 두는 게 유일하게 안 어긋나는 방법이다.

// 처리 중 취소 — 워커가 다시 안 집게 DB를 옮기고(RPC), 떠 있는 LLM 콜을 끊는다.
// 순서가 중요하다: RPC 먼저라야 멤버십 검증을 통과한 취소만 콜을 끊는다. abort를 앞세우면
// 남의 Space 원본 id를 아는 것만으로 그 처리를 방해할 수 있다(검증은 RPC 안에 있으므로).
export async function cancelSourceDigestion(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<void> {
  const { supabase, sourceId } = args;

  const { error } = await supabase.rpc("cancel_source_digestion", {
    p_source_id: sourceId,
  });
  throwIfSupabaseError(error);

  abortDigestion(sourceId);
}

// 초안에서 Source 삭제 — 결정 #2대로 사용자에겐 완전 삭제(복원 표면 없음). 백엔드는
// trashed→30일→pg_cron purge라 물리 삭제만 지연될 뿐, 목록·검색에선 즉시 사라진다.
export async function deleteSource(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<void> {
  const { supabase, sourceId } = args;

  const { error } = await supabase.rpc("trash_source", {
    p_source_id: sourceId,
  });
  throwIfSupabaseError(error);
}

// SOURCE_DELETE_MANY_MAX(200)이 배열 길이는 막아주지만 동시성까지 막아주진 않는다
// — 세마포어 없이 그대로 두면 최악의 경우 한 요청에서 trash_source RPC 200개가
// 한꺼번에 나간다. LLM 콜처럼 비싸진 않아도 무제한 fan-out은 안 두는 게 안전하다.
const SOURCE_DELETE_CONCURRENCY = 10;
const limitDelete = createLimiter(SOURCE_DELETE_CONCURRENCY);

// 초안 벌크 삭제 — sourceId 개수만큼 source.delete를 개별 tRPC 호출로 배치하면(구
// useDeleteWaitingDrafts) URL이 프로시저명을 반복 이어붙여 Fastify maxParamLength를
// 넘겨 전체 실패하던 문제(#432)의 근본 수정. 프로시저 호출 자체를 하나로 묶어 배치
// 링크를 안 태우고, 개별 trash_source 실패는 이전 클라이언트 구현과 동일하게 "동시성
// 충돌(source_state_changed)이면 무시, 그 외 예상 밖 실패만 Sentry로 올림 + 카운트"로
// 취급한다 — 이미 trashed거나 아직 처리 중이면 원하는 최종 상태에 수렴하는 정상 동시성
// 결과지 장애가 아니다.
export async function deleteSources(args: {
  supabase: TypedSupabaseClient;
  sourceIds: string[];
}): Promise<{ failedCount: number }> {
  const { supabase, sourceIds } = args;

  const results = await Promise.allSettled(
    sourceIds.map((sourceId) =>
      limitDelete(() => deleteSource({ supabase, sourceId })),
    ),
  );
  const unexpectedFailures = results.filter(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected" && !isSourceStateConflict(result.reason),
  );
  for (const failure of unexpectedFailures) {
    Sentry.captureException(failure.reason);
  }
  return { failedCount: unexpectedFailures.length };
}

function isSourceStateConflict(error: unknown): boolean {
  return (
    error instanceof SupabaseError && error.code === "source_state_changed"
  );
}

// 초안에서 Space 재지정 — 순수 메타데이터 이동이라 statements·statement_sources는
// 그대로 두고 sources.space_id만 옮긴다. 멤버십은 RPC가 양쪽 Space 다 확인한다.
export async function reassignSourceSpace(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  spaceId: string;
}): Promise<void> {
  const { supabase, sourceId, spaceId } = args;

  const { error } = await supabase.rpc("reassign_source_space", {
    p_source_id: sourceId,
    p_space_id: spaceId,
  });
  throwIfSupabaseError(error);
}

// Digest 추출 실행 — 취소·실패·결과없음 어느 쪽에서 출발하든 같은 도착지(처리 중).
// review 1차의 "실패 시 재시도"도 이 액션을 그대로 쓴다.
export async function startSourceDigestion(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<void> {
  const { supabase, sourceId } = args;

  const { error } = await supabase.rpc("start_source_digestion", {
    p_source_id: sourceId,
  });
  throwIfSupabaseError(error);
}

// 초안에서 Source 제목 편집 — "평범한 대기 상태"에서만 허용(RPC의 WHERE 가드).
export async function updateSourceTitle(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  title: string;
}): Promise<void> {
  const { supabase, sourceId, title } = args;

  const { error } = await supabase.rpc("update_source_title", {
    p_source_id: sourceId,
    p_title: title,
  });
  throwIfSupabaseError(error);
}

// 재추출 전에 원본 고치기 — "결과없음"에서 다시 돌려봐야 원본이 그대로면 결과도 같다.
// 열린 리뷰가 있으면 RPC 가드가 막는다: 리뷰에 떠 있는 Digest들이 바로 이 body에서
// 뽑힌 것들이라, 갈아치우면 화면의 후보들이 없는 문장에서 나온 것이 된다.
export async function updateSourceBody(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  body: string;
}): Promise<void> {
  const { supabase, sourceId, body } = args;

  const { error } = await supabase.rpc("update_source_body", {
    p_source_id: sourceId,
    p_body: body,
  });
  throwIfSupabaseError(error);
}

// Source 제목 생성 — 생성 직후 딱 한 번, 응답을 안 붙잡고 뒤에서 돈다(trackEvent와 같은
// 부수효과 호출 규약: 절대 안 던지고, 실패는 Sentry로만 샌다). 제목이 없다고 원본 저장이
// 실패할 이유는 없고, 화면도 제목 없는 원본을 body 미리보기로 그린다.
//
// 재시도·큐가 없는 건 의도다. 제목은 평생 한 번만 시도하는 값이라(fill_source_title의 null
// 가드가 그걸 구조로 못박는다) 이 콜이 죽으면 그 원본은 제목 없이 남고, 그 뒤론 사람이
// 직접 붙이는 것 외엔 아무도 안 건드린다.
function fillSourceTitle(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  sourceId: string;
  body: string;
}): void {
  const { supabase, providers, sourceId, body } = args;

  void (async () => {
    try {
      const raw = await providers.llm
        .forTask("generateSourceTitle")
        .generateText({
          systemPrompt: SOURCE_TITLE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildSourceTitleMessage(body) }],
        });

      // 공백뿐인 응답은 프로바이더의 빈 응답 가드(완전히 빈 문자열)를 통과해 여기까지 온다.
      // 조용히 돌아서면 프로바이더가 통째로 망가져 전 원본의 제목이 안 붙어도 아무도 모른다.
      const title = raw.trim().slice(0, SOURCE_TITLE_MAX_LENGTH);
      if (!title) {
        Sentry.captureMessage("[source-title] LLM returned a blank title", {
          level: "warning",
          extra: { sourceId },
        });
        return;
      }

      const { error } = await supabase.rpc("fill_source_title", {
        p_source_id: sourceId,
        p_title: title,
      });
      if (error) {
        Sentry.captureMessage(
          `[source-title] fill_source_title failed: ${error.message}`,
          { level: "warning", extra: { sourceId } },
        );
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: "source-title" },
        extra: { sourceId },
      });
    }
  })();
}

interface SourceStatement {
  id: string;
  content: string;
  type: Database["public"]["Enums"]["statement_type"];
  confidence: Database["public"]["Enums"]["statement_confidence"] | null;
  ingestionStatus: Database["public"]["Enums"]["ingestion_status"];
  createdAt: string;
  orderIndex: number | null;
  // 이 진술로 합쳐진(같은 말) 중복들의 출처 id — 자기 출처 외 추가분 (NEM-162).
  // 화면이 "이 진술은 글 N개에서도 나옴(쌓일수록 더 믿게 됨)"을 그릴 재료.
  mergedFromSourceIds: string[];
}

interface SourceDetail {
  id: string;
  body: string;
  extractionStatus: ExtractionStatus;
  errorMessage: string | null;
  createdAt: string;
  statements: SourceStatement[];
}

// source 하나 + 추출된 진술들(원문 등장 순서) — 처리 상태 폴링도 이 조회를 쓴다
export async function getSource(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<SourceDetail> {
  const { supabase, sourceId } = args;

  const { data: row, error } = await supabase
    .from("sources")
    .select(
      "id, body, extraction_status, error_message, created_at, statement_sources(locator, statements(id, content, type, confidence, status, ingestion_status, created_at))",
    )
    .eq("id", sourceId)
    .eq("status", "active")
    .single();
  throwIfSupabaseError(error);

  const baseStatements = row.statement_sources
    .flatMap((ref) =>
      ref.statements && ref.statements.status === "active"
        ? [
            {
              id: ref.statements.id,
              content: ref.statements.content,
              type: ref.statements.type,
              confidence: ref.statements.confidence,
              ingestionStatus: ref.statements.ingestion_status,
              createdAt: ref.statements.created_at,
              orderIndex: parseLocatorIndex(ref.locator),
            },
          ]
        : [],
    )
    .sort(
      (a, b) =>
        (a.orderIndex ?? Number.MAX_SAFE_INTEGER) -
          (b.orderIndex ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.localeCompare(b.createdAt),
    );

  const mergedSourceIdsByKeeper = await fetchMergedSourceIds({
    supabase,
    keeperIds: baseStatements.map((s) => s.id),
    ownSourceId: sourceId,
  });
  const statements: SourceStatement[] = baseStatements.map((s) => ({
    ...s,
    mergedFromSourceIds: mergedSourceIdsByKeeper.get(s.id) ?? [],
  }));

  return {
    id: row.id,
    body: row.body,
    extractionStatus: row.extraction_status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    statements,
  };
}

// 합쳐진(같은 말) 출처 모으기 — keeper별로, keeper=from인 active duplicates 관계가 가리킨
// 중복(to)들의 출처 id(중복 제거). 관계가 active ⇔ 중복이 가려진(병합된) 상태라, 되돌리기로
// 병합이 풀리면(관계 archived) 자동 제외된다. ownSourceId(지금 보는 글)는 뺀다 — 같은 글 안
// 비대칭 합치기가 "다른 글에도 있음"으로 잘못 세어지지 않게(cross-source 보강만 센다). 한
// 단계만 따른다: keeper는 늘 살아남는 쪽이라(가리는 건 새 진술뿐) 병합 사슬이 안 생긴다.
//
// resolve_duplicate_relation(relation_judgment 마이그레이션) 도입 이후로는 이 전제가
// 새 병합 건에는 더 이상 성립하지 않는다 — 실제 판정 병합은 duplicates 관계를 만들지
// 않고 keeper·duplicate 양쪽 Digest·진술을 모두 archive하기 때문이다(surface-inventory.md
// "관계 판정 화면(중복/병합)"). 이 함수는 그 이전에 즉시-병합으로 만들어진 과거 데이터만
// 계속 찾아낸다 — Kyle 확인 후 의도적으로 남겨둔 상태(2026-07-21).
export async function fetchMergedSourceIds(params: {
  supabase: TypedSupabaseClient;
  keeperIds: string[];
  ownSourceId: string;
}): Promise<Map<string, string[]>> {
  const { supabase, keeperIds, ownSourceId } = params;
  if (keeperIds.length === 0) {
    return new Map();
  }

  const { data: relations, error: relError } = await supabase
    .from("statement_relations")
    .select("from_id, to_id")
    .in("from_id", keeperIds)
    .eq("type", "duplicates")
    .eq("status", "active");
  throwIfSupabaseError(relError);

  const duplicateIds = (relations ?? []).map((r) => r.to_id);
  if (duplicateIds.length === 0) {
    return new Map();
  }

  const { data: refs, error: refError } = await supabase
    .from("statement_sources")
    .select("statement_id, source_id")
    .in("statement_id", duplicateIds);
  throwIfSupabaseError(refError);

  const sourcesByDuplicate = new Map<string, string[]>();
  for (const ref of refs ?? []) {
    const list = sourcesByDuplicate.get(ref.statement_id) ?? [];
    list.push(ref.source_id);
    sourcesByDuplicate.set(ref.statement_id, list);
  }

  const byKeeper = new Map<string, Set<string>>();
  for (const relation of relations ?? []) {
    const set = byKeeper.get(relation.from_id) ?? new Set<string>();
    for (const sourceId of sourcesByDuplicate.get(relation.to_id) ?? []) {
      if (sourceId !== ownSourceId) {
        set.add(sourceId);
      }
    }
    byKeeper.set(relation.from_id, set);
  }

  return new Map(
    [...byKeeper]
      .map(([keeper, ids]): [string, string[]] => [keeper, [...ids]])
      .filter(([, ids]) => ids.length > 0),
  );
}

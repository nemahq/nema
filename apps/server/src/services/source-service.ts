import type {
  ContentLanguage,
  Digest,
  DigestRelation,
  DigestWithRelations,
  SourceDeleteResult,
  SourceDraft,
  SourceGetResult,
  SourceIngestResult,
  SourceWithDigests,
} from "@nema-io/shared";
import {
  DigestSchema,
  SourceDraftSchema,
  SourceGetResultSchema,
  SourceWithDigestsSchema,
} from "@nema-io/shared";

import { createLimiter } from "@server/infra/limiter";
import { getDigestGenerationProvider } from "@server/infra/llm/provider";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import {
  buildDigestGenerationMessage,
  buildDigestGenerationSystemPrompt,
  DigestGenerationSchema,
  flattenGeneratedDigests,
} from "@server/prompts/digest-generation";
import {
  deleteDigestVectors,
  indexDigests,
} from "@server/services/digest-index-service";
import { linkRelations } from "@server/services/digest-relation-service";
import { logGetSource } from "@server/services/mcp-tool-call-log-service";
import { getProfile } from "@server/services/profile-service";
import { SUPPORT_WEAKEN_JUDGMENT } from "@server/services/relation-rules";
import type { RequestOrigin } from "@server/trpc";

// DB 컬럼 기본값(profiles.content_language)과 같은 값으로 떨어뜨린다. 행이 없는
// 상태는 로그인은 했지만 온보딩 모달을 아직 못 끝낸 아주 좁은 틈뿐이라(모달이
// 강제라 넘어갈 수 없다), 그 순간을 위해 별도 오류 경로를 만들지 않는다.
const FALLBACK_CONTENT_LANGUAGE: ContentLanguage = "en";

export async function ingestSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  body: string;
}): Promise<SourceIngestResult> {
  const { supabase, userId, body } = args;

  const { data: source, error } = await supabase
    .from("sources")
    .insert({ user_id: userId, body })
    .select("id")
    .single();
  throwIfSupabaseError(error);

  const contentLanguage = await resolveContentLanguage({ supabase, userId });
  const { normalized, sourceTitle } = await generateDigests(
    body,
    contentLanguage,
  );
  const digests = await saveDigestsAndIndex({
    supabase,
    userId,
    sourceId: source.id,
    normalized,
    sourceTitle,
  });
  return { sourceId: source.id, digests };
}

export async function reExtractSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
}): Promise<SourceIngestResult> {
  const { supabase, userId, sourceId } = args;

  // RLS(owner-only)라 남의/없는 sourceId는 여기서 not-found로 걸린다.
  const { data: source, error: fetchError } = await supabase
    .from("sources")
    .select("id, body")
    .eq("id", sourceId)
    .single();
  throwIfSupabaseError(fetchError);

  const contentLanguage = await resolveContentLanguage({ supabase, userId });
  // LLM 호출을 기존 다이제스트 삭제보다 먼저 한다 — 여기서 실패하면(rate limit,
  // content filter, 스키마 검증 실패 등) 원문도 이전 다이제스트도 안 건드린 채
  // 그대로 남아 다시 부르면 된다. 순서를 반대로 하면 실패할 때마다 다이제스트가
  // 0개인 상태가 영구화될 위험이 있다.
  const { normalized, sourceTitle } = await generateDigests(
    source.body,
    contentLanguage,
  );

  const { error: statusError } = await supabase
    .from("sources")
    .update({ digestion_status: "pending" })
    .eq("id", sourceId);
  throwIfSupabaseError(statusError);

  // 지워지는 digest id를 같이 받아둔다 — 새 다이제스트를 색인한 뒤 이 id들의 옛
  // 벡터를 지운다. 순서가 반대면(새로 색인하기 전에 지우면) 색인이 실패했을 때
  // 검색 가능한 벡터가 하나도 안 남는 구간이 생긴다.
  const { data: deletedDigests, error: deleteError } = await supabase
    .from("digests")
    .delete()
    .eq("source_id", sourceId)
    .select("id");
  throwIfSupabaseError(deleteError);

  const digests = await saveDigestsAndIndex({
    supabase,
    userId,
    sourceId: source.id,
    normalized,
    sourceTitle,
  });

  await deleteDigestVectors((deletedDigests ?? []).map((row) => row.id));

  return { sourceId: source.id, digests };
}

export async function deleteSource(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<SourceDeleteResult> {
  const { supabase, sourceId } = args;

  // CASCADE가 Postgres 쪽 digests는 정리하지만 Qdrant는 안 건드린다 — 지워질
  // digest id를 미리 받아둬야 벡터도 같이 지울 수 있다. RLS라 남의 원문이면
  // 이 조회도 빈 배열이라 안전하다.
  const { data: existingDigests } = await supabase
    .from("digests")
    .select("id")
    .eq("source_id", sourceId);

  const { data, error } = await supabase
    .from("sources")
    .delete()
    .eq("id", sourceId)
    .select("id");
  throwIfSupabaseError(error);

  const deleted = (data ?? []).length > 0;
  if (deleted) {
    await deleteDigestVectors((existingDigests ?? []).map((row) => row.id));
  }

  return { success: deleted };
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

export async function getSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
  origin: RequestOrigin;
}): Promise<SourceGetResult> {
  const { supabase, userId, sourceId, origin } = args;

  // RLS(owner-only)라 남의/없는 sourceId는 여기서 not-found로 걸린다.
  const { data, error } = await supabase
    .from("sources")
    .select("id, name, body, created_at")
    .eq("id", sourceId)
    .single();
  throwIfSupabaseError(error);

  // 이 로그는 "정리본으로 부족해 원문을 봤다"를 세는 MCP 전용 품질 지표다 —
  // 원문 상세 화면에서 사람이 직접 열어본 것까지 섞이면 지표 의미가 깨진다.
  // 로그 저장은 응답을 기다리게 하지 않는다 — 실패 격리뿐 아니라 지연도 격리한다.
  if (origin === "mcp") {
    void logGetSource({ userId, detail: { sourceId } });
  }

  return SourceGetResultSchema.parse({
    sourceId: data.id,
    name: data.name,
    body: data.body,
    createdAt: data.created_at,
  });
}

// 두 목록 모두 아직 진짜 페이지네이션이 없다 — 지금은 이 값 하나로 폭주만
// 막는다(legacy의 LIMIT 50과 같은 취지). 실사용 규모가 커지면 커서 기반
// 페이지네이션으로 바꿔야 한다.
const SOURCE_LIST_SAFETY_LIMIT = 500;

export async function listSourcesWithDigests(args: {
  supabase: TypedSupabaseClient;
}): Promise<SourceWithDigests[]> {
  const { supabase } = args;

  // digests!inner로 다이제스트 행이 하나도 없는 원문을 걸러낸다 — 그건
  // listDraftSources(초안 화면) 몫이다. 가려진 행도 "행이 있다"에는 포함되므로
  // 다 가려도 원문 자체는 목록에 남는다(원문을 지울 진입점을 유지해야 해서).
  // digestion_status='completed' 조건은 listDraftSources와 겹치지 않게 막는
  // 안전장치다 — saveDigestsAndIndex가 digest 행을 커밋한 뒤 상태를 completed로
  // 바꾸는 마지막 UPDATE만 실패하면(드물지만) pending인데 digest 행은 있는 원문이
  // 생기고, 이 조건이 없으면 그 원문이 두 목록에 동시에 뜬다.
  const { data, error } = await supabase
    .from("sources")
    .select(
      "id, name, created_at, digests!inner(id, type, title, extraction_order, hidden_at)",
    )
    .eq("digestion_status", "completed")
    .order("created_at", { ascending: false })
    .order("extraction_order", {
      referencedTable: "digests",
      ascending: true,
    })
    .limit(SOURCE_LIST_SAFETY_LIMIT);
  throwIfSupabaseError(error);

  return (data ?? []).map(toSourceWithDigests);
}

export async function listDraftSources(args: {
  supabase: TypedSupabaseClient;
}): Promise<SourceDraft[]> {
  const { supabase } = args;

  // 필터(pending 또는 digests 0건)는 v_draft_sources 뷰가 DB에서 미리 건다 —
  // 여기서 JS로 걸렀다면 상한(limit)이 거르기 전에 먼저 잘라, 원문이 많을 때
  // 실제로 있는 초안이 빈 목록으로 보일 수 있었다(에러 없이 조용히 틀림).
  const { data, error } = await supabase
    .from("v_draft_sources")
    .select("id, name, body_preview, created_at, digestion_status")
    .order("created_at", { ascending: false })
    .limit(SOURCE_LIST_SAFETY_LIMIT);
  throwIfSupabaseError(error);

  return (data ?? []).map(toSourceDraft);
}

type SourceWithDigestsRow = Pick<
  Database["public"]["Tables"]["sources"]["Row"],
  "id" | "name" | "created_at"
> & {
  digests: Array<
    Pick<
      Database["public"]["Tables"]["digests"]["Row"],
      "id" | "type" | "title" | "hidden_at"
    >
  >;
};

function toSourceWithDigests(row: SourceWithDigestsRow): SourceWithDigests {
  return SourceWithDigestsSchema.parse({
    sourceId: row.id,
    name: row.name,
    createdAt: row.created_at,
    digests: row.digests
      .filter((digest) => digest.hidden_at === null)
      .map((digest) => ({
        id: digest.id,
        type: digest.type,
        title: digest.title,
      })),
  });
}

// 뷰(v_draft_sources)의 생성 타입은 컬럼을 전부 nullable로 잡는다 — 밑 테이블
// (sources)에는 전부 NOT NULL 컬럼이라 실제로 null이 나올 일은 없다. 그래도
// round-trip을 실제로 검증하는 SourceDraftSchema.parse가 이 전제를 지킨다:
// 어긋나면(예: 뷰 정의가 조인으로 바뀌어 실제로 null이 새면) 여기서 곧바로 던진다.
type SourceDraftRow = Pick<
  Database["public"]["Views"]["v_draft_sources"]["Row"],
  "id" | "name" | "body_preview" | "created_at" | "digestion_status"
>;

function toSourceDraft(row: SourceDraftRow): SourceDraft {
  return SourceDraftSchema.parse({
    sourceId: row.id,
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
  // source 행은 digestion_status: pending으로 남아, 재추출로 복구할 수 있다.
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
  throwIfSupabaseError(statusError);

  // 색인 다음에 잇는다 — 후보를 방금 색인한 벡터로 찾기 때문에 순서를 바꿀 수 없다.
  // 색인과 달리 실패해도 안 던진다: 관계는 아무것도 접지 않아 없어도 다이제스트는
  // 온전하고, 여기서 던지면 이미 저장된 정리 결과까지 사용자가 잃는다.
  const relationsByDigestId = await linkRelations({
    supabase,
    userId,
    sourceId,
    digests,
    judgment: SUPPORT_WEAKEN_JUDGMENT,
  }).catch((error: unknown) => {
    console.warn(
      `[source-service] 관계 잇기 실패 — 다이제스트는 그대로 둔다, sourceId: ${sourceId}:`,
      error,
    );
    return new Map<string, DigestRelation[]>();
  });

  return digests.map((digest) => ({
    ...digest,
    relations: relationsByDigestId.get(digest.id) ?? [],
  }));
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

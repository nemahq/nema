import type {
  ContentLanguage,
  Digest,
  SourceDeleteResult,
  SourceGetResult,
  SourceIngestResult,
} from "@nema-io/shared";
import { DigestSchema, SourceGetResultSchema } from "@nema-io/shared";

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
import { logGetSource } from "@server/services/mcp-tool-call-log-service";
import { getProfile } from "@server/services/profile-service";

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
  const normalized = await generateDigests(body, contentLanguage);
  const digests = await saveDigestsAndIndex({
    supabase,
    userId,
    sourceId: source.id,
    normalized,
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
  const normalized = await generateDigests(source.body, contentLanguage);

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

export async function getSource(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
}): Promise<SourceGetResult> {
  const { supabase, userId, sourceId } = args;

  // RLS(owner-only)라 남의/없는 sourceId는 여기서 not-found로 걸린다.
  const { data, error } = await supabase
    .from("sources")
    .select("id, body, created_at")
    .eq("id", sourceId)
    .single();
  throwIfSupabaseError(error);

  await logGetSource({ supabase, userId, detail: { sourceId } });

  return SourceGetResultSchema.parse({
    sourceId: data.id,
    body: data.body,
    createdAt: data.created_at,
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
): Promise<Array<Pick<Digest, "type" | "title" | "body">>> {
  const generated = await getDigestGenerationProvider().generateStructured({
    systemPrompt: buildDigestGenerationSystemPrompt(contentLanguage),
    messages: [{ role: "user", content: buildDigestGenerationMessage(body) }],
    schema: DigestGenerationSchema,
  });
  return flattenGeneratedDigests(generated);
}

async function saveDigestsAndIndex(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
  normalized: Array<Pick<Digest, "type" | "title" | "body">>;
}): Promise<Digest[]> {
  const { supabase, userId, sourceId, normalized } = args;

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
    .update({ digestion_status: "completed" })
    .eq("id", sourceId);
  throwIfSupabaseError(statusError);

  return digests;
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
      normalized.map((digest) => ({
        source_id: sourceId,
        type: digest.type,
        title: digest.title,
        body: digest.body,
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

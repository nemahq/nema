import type {
  Digest,
  SourceDeleteResult,
  SourceIngestResult,
} from "@nema-io/shared";
import { DigestSchema } from "@nema-io/shared";

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

  const normalized = await generateDigests(body);
  const digests = await saveDigestsAndMarkCompleted({
    supabase,
    sourceId: source.id,
    normalized,
  });
  return { sourceId: source.id, digests };
}

export async function reExtractSource(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<SourceIngestResult> {
  const { supabase, sourceId } = args;

  // RLS(owner-only)라 남의/없는 sourceId는 여기서 not-found로 걸린다.
  const { data: source, error: fetchError } = await supabase
    .from("sources")
    .select("id, body")
    .eq("id", sourceId)
    .single();
  throwIfSupabaseError(fetchError);

  // LLM 호출을 기존 다이제스트 삭제보다 먼저 한다 — 여기서 실패하면(rate limit,
  // content filter, 스키마 검증 실패 등) 원문도 이전 다이제스트도 안 건드린 채
  // 그대로 남아 다시 부르면 된다. 순서를 반대로 하면 실패할 때마다 다이제스트가
  // 0개인 상태가 영구화될 위험이 있다.
  const normalized = await generateDigests(source.body);

  const { error: statusError } = await supabase
    .from("sources")
    .update({ digestion_status: "pending" })
    .eq("id", sourceId);
  throwIfSupabaseError(statusError);

  const { error: deleteError } = await supabase
    .from("digests")
    .delete()
    .eq("source_id", sourceId);
  throwIfSupabaseError(deleteError);

  const digests = await saveDigestsAndMarkCompleted({
    supabase,
    sourceId: source.id,
    normalized,
  });
  return { sourceId: source.id, digests };
}

export async function deleteSource(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<SourceDeleteResult> {
  const { supabase, sourceId } = args;

  const { data, error } = await supabase
    .from("sources")
    .delete()
    .eq("id", sourceId)
    .select("id");
  throwIfSupabaseError(error);

  return { success: (data ?? []).length > 0 };
}

async function generateDigests(
  body: string,
): Promise<Array<Pick<Digest, "type" | "title" | "body">>> {
  const generated = await getDigestGenerationProvider().generateStructured({
    systemPrompt: buildDigestGenerationSystemPrompt(),
    messages: [{ role: "user", content: buildDigestGenerationMessage(body) }],
    schema: DigestGenerationSchema,
  });
  return flattenGeneratedDigests(generated);
}

async function saveDigestsAndMarkCompleted(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  normalized: Array<Pick<Digest, "type" | "title" | "body">>;
}): Promise<Digest[]> {
  const { supabase, sourceId, normalized } = args;

  const digests =
    normalized.length === 0
      ? []
      : await saveDigests({ supabase, sourceId, normalized });

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

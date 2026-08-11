import type { Digest, DigestType } from "@nema-io/shared";

import { getDigestGenerationProvider } from "@server/infra/llm/provider";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import {
  buildDigestGenerationMessage,
  DIGEST_GENERATION_SYSTEM_PROMPT,
  DigestGenerationSchema,
  normalizeDigest,
} from "@server/prompts/digest-generation";

interface SourceIngestResult {
  sourceId: string;
  digests: Digest[];
}

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

  return generateAndSaveDigests({ supabase, sourceId: source.id, body });
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

  const { error: deleteError } = await supabase
    .from("digests")
    .delete()
    .eq("source_id", sourceId);
  throwIfSupabaseError(deleteError);

  const { error: statusError } = await supabase
    .from("sources")
    .update({ digestion_status: "pending" })
    .eq("id", sourceId);
  throwIfSupabaseError(statusError);

  return generateAndSaveDigests({
    supabase,
    sourceId: source.id,
    body: source.body,
  });
}

export async function deleteSource(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<{ success: boolean }> {
  const { supabase, sourceId } = args;

  const { data, error } = await supabase
    .from("sources")
    .delete()
    .eq("id", sourceId)
    .select("id");
  throwIfSupabaseError(error);

  return { success: (data ?? []).length > 0 };
}

// 원문 저장과 다이제스트 저장을 별개 커밋으로 가른다 — LLM 호출이 실패해도 원문은
// 남아 재추출로 회복할 수 있다(킥오프 "흐름 — 동기").
async function generateAndSaveDigests(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
  body: string;
}): Promise<SourceIngestResult> {
  const { supabase, sourceId, body } = args;

  const generated = await getDigestGenerationProvider().generateStructured({
    systemPrompt: DIGEST_GENERATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildDigestGenerationMessage(body) }],
    schema: DigestGenerationSchema,
  });
  const normalized = generated.digests.map(normalizeDigest);

  const digests =
    normalized.length === 0
      ? []
      : await saveDigests({ supabase, sourceId, normalized });

  const { error: statusError } = await supabase
    .from("sources")
    .update({ digestion_status: "completed" })
    .eq("id", sourceId);
  throwIfSupabaseError(statusError);

  return { sourceId, digests };
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

function toDigest(row: DigestRow): Digest {
  const digest = {
    id: row.id,
    type: row.type as DigestType,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
  return digest as Digest;
}

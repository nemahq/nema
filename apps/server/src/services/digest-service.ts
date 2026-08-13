import type { DigestSearchResult } from "@nema-io/shared";
import { DigestSearchResultSchema } from "@nema-io/shared";

import { getEmbeddingProvider } from "@server/infra/embedding";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import { getVectorStore } from "@server/infra/vector";

export async function searchDigests(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  query: string;
  limit: number;
}): Promise<DigestSearchResult[]> {
  const { supabase, userId, query, limit } = args;

  const hits = await getVectorStore().search(getEmbeddingProvider(), {
    userId,
    query,
    limit,
  });
  if (hits.length === 0) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from("digests")
    .select("id, source_id, type, title, body, created_at")
    .in(
      "id",
      hits.map((hit) => hit.digestId),
    );
  throwIfSupabaseError(error);

  // .in()은 Qdrant가 매긴 점수 순서를 보장하지 않는다 — 다시 정렬해서 되돌린다.
  const scoreByDigestId = new Map(hits.map((hit) => [hit.digestId, hit.score]));
  return (rows ?? [])
    .map((row) => toDigestSearchResult(row, scoreByDigestId.get(row.id) ?? 0))
    .sort((a, b) => b.score - a.score);
}

type DigestSearchRow = Pick<
  Database["public"]["Tables"]["digests"]["Row"],
  "id" | "source_id" | "type" | "title" | "body" | "created_at"
>;

function toDigestSearchResult(
  row: DigestSearchRow,
  score: number,
): DigestSearchResult {
  return DigestSearchResultSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    score,
  });
}

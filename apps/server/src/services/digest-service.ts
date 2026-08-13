import type { DigestSearchResult } from "@nema-io/shared";
import { DigestSearchResultSchema } from "@nema-io/shared";

import { getEmbeddingProvider } from "@server/infra/embedding";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import { getVectorStore } from "@server/infra/vector";
import { logSearch } from "@server/services/mcp-tool-call-log-service";

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
    // 로그 저장은 응답을 기다리게 하지 않는다 — 실패 격리뿐 아니라 지연도 격리한다.
    void logSearch({ userId, detail: { query, results: [] } });
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
  const results = (rows ?? [])
    .map((row) => toDigestSearchResult(row, scoreByDigestId.get(row.id) ?? 0))
    .sort((a, b) => b.score - a.score);

  // 로그는 벡터 hits가 아니라 실제로 반환되는 results를 적는다 — .in() 필터로
  // digests 쪽에서 걸러진 것과 벡터 검색이 찾은 것이 갈릴 수 있어서다. 응답을
  // 기다리게 하지 않도록 여기서도 await하지 않는다.
  void logSearch({
    userId,
    detail: {
      query,
      results: results.map((result) => ({
        digestId: result.id,
        score: result.score,
      })),
    },
  });
  return results;
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

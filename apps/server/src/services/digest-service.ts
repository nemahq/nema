import type {
  DigestDeleteResult,
  DigestDetail,
  DigestSearchResult,
} from "@nema-io/shared";
import { DigestDetailSchema, DigestSearchResultSchema } from "@nema-io/shared";

import { getEmbeddingProvider } from "@server/infra/embedding";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import { getVectorStore } from "@server/infra/vector";
import { deleteDigestVectors } from "@server/services/digest-index-service";
import {
  logGetDigest,
  logSearch,
} from "@server/services/mcp-tool-call-log-service";

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

  // 벡터는 가림과 함께 실제로 지우니 원래는 안 걸리지만, 벡터 삭제
  // (deleteDigestVectors)가 실패해도 던지지 않고 경고만 남기는 구조라 고아
  // 벡터가 생길 수 있다 — 그 벡터가 여기서 걸리면 가려진 다이제스트가 검색
  // 결과로 돌아간다. 조건을 걸어 막는다.
  const { data: rows, error } = await supabase
    .from("digests")
    .select("id, source_id, type, title, body, created_at")
    .in(
      "id",
      hits.map((hit) => hit.digestId),
    )
    .is("hidden_at", null);
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

export async function deleteDigest(args: {
  supabase: TypedSupabaseClient;
  digestId: string;
}): Promise<DigestDeleteResult> {
  const { supabase, digestId } = args;

  // RLS(owner-only, source_id 조인)라 남의/없는 digestId는 0행으로 걸린다.
  // 이미 가려진 digestId를 다시 불러도 에러가 아니다(source.delete와 같은 관행) —
  // Postgres 행은 남기고 표시만 남긴다(가림), 몇 개를 걷어냈는지가 정리 품질
  // 지표로 남아야 해서다. 조건 없이 갱신하므로 재호출하면 hidden_at이 최초
  // 가림 시각이 아니라 마지막 호출 시각으로 덮어써진다 — "언제 걷어냈나"는
  // 지금 지표가 요구하지 않아 의도적으로 감수한다.
  const { data, error } = await supabase
    .from("digests")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", digestId)
    .select("id");
  throwIfSupabaseError(error);

  const deleted = (data ?? []).length > 0;
  if (deleted) {
    await deleteDigestVectors([digestId]);
  }

  return { success: deleted };
}

export async function getDigest(
  args: {
    supabase: TypedSupabaseClient;
    userId: string;
    // 둘 다 받는 이유는 DigestGetInputSchema 참고.
  } & ({ digestPublicId: string } | { digestId: string }),
): Promise<DigestDetail> {
  const { supabase, userId } = args;

  // RLS(owner-only)라 남의/없는 값은 여기서 not-found로 걸린다. 가려진 것도 같은
  // 자리에서 not-found가 된다 — 사용자에게는 지워진 것으로 보이므로 다시 물어도
  // 돌아오면 안 된다.
  const query = supabase
    .from("digests")
    .select("id, source_id, type, title, body, created_at");
  const { data, error } = await (
    "digestPublicId" in args
      ? query.eq("public_id", args.digestPublicId)
      : query.eq("id", args.digestId)
  )
    .is("hidden_at", null)
    .single();
  throwIfSupabaseError(error);

  // 로그 저장은 응답을 기다리게 하지 않는다 — 실패 격리뿐 아니라 지연도 격리한다.
  // 로그에는 내부 id를 남긴다 — public_id는 조회 입력일 뿐 지표가 참조하는 식별자가 아니다.
  void logGetDigest({ userId, detail: { digestId: data.id } });

  return DigestDetailSchema.parse({
    id: data.id,
    sourceId: data.source_id,
    type: data.type,
    title: data.title,
    body: data.body,
    createdAt: data.created_at,
  });
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

import type {
  Digest,
  DigestDeleteResult,
  DigestDetail,
  DigestSearchResult,
} from "@nema-io/shared";
import {
  DigestDetailSchema,
  DigestSchema,
  DigestSearchResultSchema,
} from "@nema-io/shared";

import { getEmbeddingProvider } from "@server/infra/embedding";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import { getVectorStore } from "@server/infra/vector";
import {
  deleteDigestVectors,
  indexDigests,
} from "@server/services/digest-index-service";
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
  // 결과로 돌아간다. v_visible_digests(3단 상속 판정)를 읽어 막는다.
  //
  // .returns<>()로 실제 컬럼 타입(NOT NULL)을 선언한다 — 뷰의 생성 타입은
  // WHERE가 거른 뒤에도 컬럼을 전부 nullable로 잡는데(뷰 공통 관례), 이 결과는
  // toDigestSearchResult의 zod parse 전에 Map 조회 키로도 쓰여 null을 안고
  // 넘어갈 수 없다.
  const { data: rows, error } = await supabase
    .from("v_visible_digests")
    .select("id, source_id, type, title, body, created_at")
    .in(
      "id",
      hits.map((hit) => hit.digestId),
    )
    .returns<DigestSearchRow[]>();
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
  // 지표로 남아야 해서다. 조건 없이 갱신하므로 재호출하면 trashed_at이 최초
  // 가림 시각이 아니라 마지막 호출 시각으로 덮어써진다 — "언제 걷어냈나"는
  // 지금 지표가 요구하지 않아 의도적으로 감수한다.
  const { data, error } = await supabase
    .from("digests")
    .update({ trashed_at: new Date().toISOString() })
    .eq("id", digestId)
    .select("id");
  throwIfSupabaseError(error);

  const deleted = (data ?? []).length > 0;
  if (deleted) {
    await deleteDigestVectors([digestId]);
  }

  return { success: deleted };
}

// 다이제스트 단독 삭제(위)의 되돌리기 — 원문 되살리기(source-service
// restoreSource)와 달리 RPC가 아니다: 원문과 달리 딸린 것이 없어 원자성으로
// 지킬 다단계 상태 전이가 없고, RLS(owner-only UPDATE)가 이미 소유 판정을 한다.
// 휴지통 화면이 없어(kickoff) 라우터엔 아직 안 붙는다.
export async function restoreDigest(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  digestId: string;
}): Promise<DigestDeleteResult> {
  const { supabase, userId, digestId } = args;

  const { data, error } = await supabase
    .from("digests")
    .update({ trashed_at: null })
    .eq("id", digestId)
    .not("trashed_at", "is", null)
    .select("id, source_id, type, title, body, created_at");
  throwIfSupabaseError(error);

  const restored = (data ?? []).length > 0;
  if (restored) {
    // 부모 원문이 trashed면(3단 상속) 이 digest는 여전히 안 보인다 — 그래도
    // 재색인은 한다: 검색은 v_visible_digests로 걸러 안 걸리고, 나중에 원문이
    // 복원되면(restoreSource) 그 시점 재색인을 다시 안 해도 벡터가 이미 있다.
    await indexDigests({ userId, digests: (data ?? []).map(toDigest) });
  }

  return { success: restored };
}

export async function getDigest(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  digestId: string;
}): Promise<DigestDetail> {
  const { supabase, userId, digestId } = args;

  // RLS(owner-only)라 남의/없는 digestId는 여기서 not-found로 걸린다. 가려진 것도
  // 같은 자리에서 not-found가 된다(v_visible_digests) — 사용자에게는 지워진
  // 것으로 보이므로 id를 들고 다시 물어도 돌아오면 안 된다.
  const { data, error } = await supabase
    .from("v_visible_digests")
    .select("id, source_id, type, title, body, created_at")
    .eq("id", digestId)
    .single();
  throwIfSupabaseError(error);

  // 로그 저장은 응답을 기다리게 하지 않는다 — 실패 격리뿐 아니라 지연도 격리한다.
  void logGetDigest({ userId, detail: { digestId } });

  return DigestDetailSchema.parse({
    id: data.id,
    sourceId: data.source_id,
    type: data.type,
    title: data.title,
    body: data.body,
    createdAt: data.created_at,
  });
}

// searchDigests의 .returns<>()가 선언하는 실제 행 모양 — digests 테이블 컬럼과
// 같다(v_visible_digests는 필터만 걸 뿐 컬럼을 안 바꾼다).
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

// restoreDigest 전용 — digests 테이블(뷰가 아니라)에서 직접 읽은 행을 indexDigests가
// 받는 Digest 모양으로 바꾼다. source-service.ts의 같은 이름 helper와 중복이지만
// 두 서비스가 이미 서로를 import하지 않는 경계라 공유 모듈로 뽑을 이유가 아직 없다.
type DigestRow = Pick<
  Database["public"]["Tables"]["digests"]["Row"],
  "id" | "type" | "title" | "body" | "created_at"
>;

function toDigest(row: DigestRow): Digest {
  return DigestSchema.parse({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  });
}

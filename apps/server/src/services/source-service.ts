import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import { parseLocatorIndex } from "@server/services/statement-search";

type ExtractionStatus = Database["public"]["Enums"]["ingestion_status"];

// 박제까지만 동기 — 추출·임베딩은 statement-sync 워커가 이어받는다.
// 응답은 source_id 하나. 화면은 이 id로 처리 상태를 추적한다 (ingestion-design 2장).
export async function createSource(args: {
  supabase: TypedSupabaseClient;
  body: string;
  sessionId?: string;
  timeZone?: string;
}): Promise<{ sourceId: string }> {
  const { supabase, body, sessionId, timeZone } = args;

  // 1인 단계: 가입 트리거가 만든 개인 Space 1개 (RLS로 내 멤버십만 보임).
  // 멀티 Space가 열리면 입력으로 받는다 — 그때까지 가장 오래된 Space가 개인 칸.
  const { data: membership, error: memberError } = await supabase
    .from("space_members")
    .select("space_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  throwIfSupabaseError(memberError);

  const { data: sourceId, error } = await supabase.rpc("create_source", {
    p_space_id: membership.space_id,
    p_body: body,
    ...(sessionId !== undefined && { p_session_id: sessionId }),
    ...(timeZone !== undefined && { p_author_timezone: timeZone }),
  });
  throwIfSupabaseError(error);

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

interface PendingSourceItem {
  sourceId: string;
  createdAt: string;
  digestionStatus: ExtractionStatus;
  errorMessage: string | null;
  // 생성이 끝나 리뷰가 열렸으면 그 pending ingestion changeset. 아직이면 null —
  // 이 값이 "초안 탭(생성 중)"과 "변경셋 대기 중(리뷰 준비됨)"을 가르는 신호다.
  reviewChangesetId: string | null;
  digestCount: number;
}

// pending 원본 목록 — 파생 없는 상태(갓 생성·생성 중·되돌려진 것). 두 표면이 이걸 읽는다:
// 리뷰 changeset이 아직 없으면 "초안" 목록, 생기면 "변경셋 대기 중"으로 넘어간다. RLS가 Space 격리.
export async function listPendingSources(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ items: PendingSourceItem[] }> {
  const { supabase } = args;

  const { data: sources, error } = await supabase
    .from("sources")
    .select("id, created_at, digestion_status, error_message")
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
    .select("id, source_id, changes(target_type)")
    .eq("type", "ingestion")
    .eq("status", "pending")
    .in("source_id", sourceIds);
  throwIfSupabaseError(changesetError);

  const reviewBySource = new Map(
    (changesets ?? []).map((changeset) => [
      changeset.source_id,
      {
        reviewChangesetId: changeset.id,
        digestCount: changeset.changes.filter(
          (change) => change.target_type === "digest",
        ).length,
      },
    ]),
  );

  return {
    items: (sources ?? []).map((source) => {
      const review = reviewBySource.get(source.id);
      return {
        sourceId: source.id,
        createdAt: source.created_at,
        digestionStatus: source.digestion_status,
        errorMessage: source.error_message,
        reviewChangesetId: review?.reviewChangesetId ?? null,
        digestCount: review?.digestCount ?? 0,
      };
    }),
  };
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

// 합쳐진(같은 말) 출처 모으기 (NEM-162) — keeper별로, duplicate_of=keeper이고 archived인
// 중복들의 출처 id(중복 제거). archived만 보므로 되돌리기로 되살아난 중복은 자동 제외된다.
// ownSourceId(지금 보는 글)는 뺀다 — 같은 글 안 비대칭 합치기가 "다른 글에도 있음"으로
// 잘못 세어지지 않게(cross-source 보강만 센다). 한 단계만 따른다: keeper는 늘 살아남는
// 쪽이라(가리는 건 새 진술뿐) duplicate_of 사슬이 안 생겨 1단계로 충분하다.
async function fetchMergedSourceIds(params: {
  supabase: TypedSupabaseClient;
  keeperIds: string[];
  ownSourceId: string;
}): Promise<Map<string, string[]>> {
  const { supabase, keeperIds, ownSourceId } = params;
  const byKeeper = new Map<string, Set<string>>();
  if (keeperIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("statements")
    .select("duplicate_of, statement_sources(source_id)")
    .in("duplicate_of", keeperIds)
    .eq("status", "archived");
  throwIfSupabaseError(error);

  for (const dup of data ?? []) {
    if (!dup.duplicate_of) {
      continue;
    }
    const set = byKeeper.get(dup.duplicate_of) ?? new Set<string>();
    for (const ref of dup.statement_sources) {
      if (ref.source_id !== ownSourceId) {
        set.add(ref.source_id);
      }
    }
    byKeeper.set(dup.duplicate_of, set);
  }

  return new Map(
    [...byKeeper]
      .map(([keeper, ids]): [string, string[]] => [keeper, [...ids]])
      .filter(([, ids]) => ids.length > 0),
  );
}

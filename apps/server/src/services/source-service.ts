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
}): Promise<{ sourceId: string }> {
  const { supabase, body, sessionId } = args;

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

// 내가 던진 글 목록 — 격리는 RLS(내 Space 멤버십)가 담당한다
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

interface SourceStatement {
  id: string;
  content: string;
  type: Database["public"]["Enums"]["statement_type"];
  confidence: Database["public"]["Enums"]["statement_confidence"] | null;
  ingestionStatus: Database["public"]["Enums"]["ingestion_status"];
  createdAt: string;
  orderIndex: number | null;
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
    .single();
  throwIfSupabaseError(error);

  const statements = row.statement_sources
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

  return {
    id: row.id,
    body: row.body,
    extractionStatus: row.extraction_status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    statements,
  };
}

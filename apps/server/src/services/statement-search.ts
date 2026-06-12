import type { Database, Json } from "@server/infra/database.types";
import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 평가 하니스 첫 실측으로 보정 (retrieval-design 3장).
// 골든 질의의 정답 점수대 0.216~0.52, 무정답 질의 최고점 0.239 —
// v1 자리값 0.6은 정답을 전부 잘라 결과가 항상 0건이었다.
// 0.2는 recall 우선 선택: 정답 하단(0.216)을 살리는 대신 무정답 최고(0.239)와
// 겹쳐 일부 오검출이 통과한다(겹침 구간은 순위로 하단 배치됨). 임베딩 모델이나
// 코퍼스가 바뀌면 분포가 통째로 이동하므로 재보정 필요 — measurement-log 참고.
const STATEMENT_SEARCH_LIMIT = 15;
const STATEMENT_SEARCH_SCORE_THRESHOLD = 0.2;

type SearchedStatementType = Database["public"]["Enums"]["statement_type"];
type SearchedStatementConfidence =
  Database["public"]["Enums"]["statement_confidence"];

interface SearchedStatement {
  id: string;
  content: string;
  type: SearchedStatementType;
  confidence: SearchedStatementConfidence | null;
  createdAt: string;
  score: number;
}

// 묶음 기준은 확장 가능 유니온 — 관계 엔진이 오면 관계 기반 kind가 추가된다 (retrieval-design 4장)
interface SourceGroupKey {
  kind: "source";
  sourceId: string;
  sourceCreatedAt: string;
}

type StatementGroupKey = SourceGroupKey;

interface StatementGroup {
  key: StatementGroupKey;
  totalStatementCount: number;
  statements: SearchedStatement[];
}

interface StatementSearchResult {
  groups: StatementGroup[];
}

export async function searchStatements(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  query: string;
}): Promise<StatementSearchResult> {
  const { supabase, providers, query } = args;

  // 격리는 내가 멤버인 Space 목록 — 오늘은 개인 Space 1개지만 처음부터 목록으로
  const { data: memberships, error: membershipError } = await supabase
    .from("space_members")
    .select("space_id");
  throwIfSupabaseError(membershipError);

  const spaceIds = (memberships ?? []).map((m) => m.space_id);
  if (spaceIds.length === 0) {
    return { groups: [] };
  }

  // 전처리 LLM 없이 그대로 임베딩(쿼리 모드) → Qdrant. statement_id+score만 받는다
  const hits = await providers.vectorStore.search(providers.embedding, {
    spaceIds,
    query,
    limit: STATEMENT_SEARCH_LIMIT,
    scoreThreshold: STATEMENT_SEARCH_SCORE_THRESHOLD,
  });

  if (hits.length === 0) {
    return { groups: [] };
  }

  const scoreByStatementId = new Map<string, number>();
  for (const hit of hits) {
    const prev = scoreByStatementId.get(hit.statementId);
    if (prev === undefined || hit.score > prev) {
      scoreByStatementId.set(hit.statementId, hit.score);
    }
  }

  // 본문은 항상 Postgres 원장에서 — Qdrant payload 사본이 진실 행세를 못 하게.
  // 원장 기준 archived는 여기서 걸러진다
  const { data: statementRows, error: statementError } = await supabase
    .from("statements")
    .select(
      "id, content, type, confidence, created_at, statement_sources(source_id, locator, sources(created_at))",
    )
    .in("id", [...scoreByStatementId.keys()])
    .eq("status", "active");
  throwIfSupabaseError(statementError);

  const statements = (statementRows ?? []).map((row) => ({
    id: row.id,
    content: row.content,
    type: row.type,
    confidence: row.confidence,
    createdAt: row.created_at,
    sources: row.statement_sources.flatMap((ref) =>
      ref.sources
        ? [
            {
              sourceId: ref.source_id,
              sourceCreatedAt: ref.sources.created_at,
              orderIndex: parseLocatorIndex(ref.locator),
            },
          ]
        : [],
    ),
  }));

  const sourceIds = [
    ...new Set(statements.flatMap((s) => s.sources.map((r) => r.sourceId))),
  ];
  if (sourceIds.length === 0) {
    return { groups: [] };
  }

  // 형제는 수만 — 이 원본의 전체 active 진술 수 (펼치기는 별도 조회, 화면 몫)
  const { data: siblingRows, error: siblingError } = await supabase
    .from("statement_sources")
    .select("source_id, statements!inner(id)")
    .in("source_id", sourceIds)
    .eq("statements.status", "active");
  throwIfSupabaseError(siblingError);

  const activeCountBySourceId = new Map<string, number>();
  for (const row of siblingRows ?? []) {
    activeCountBySourceId.set(
      row.source_id,
      (activeCountBySourceId.get(row.source_id) ?? 0) + 1,
    );
  }

  return {
    groups: assembleSourceGroups({
      statements,
      scoreByStatementId,
      activeCountBySourceId,
    }),
  };
}

interface GroupableStatement {
  id: string;
  content: string;
  type: SearchedStatementType;
  confidence: SearchedStatementConfidence | null;
  createdAt: string;
  sources: Array<{
    sourceId: string;
    sourceCreatedAt: string;
    orderIndex: number | null;
  }>;
}

// 원본(source) 묶음 — 자리 채움 구현. 관계 묶음이 와도 출처 축으로 영구히 쓰인다
export function assembleSourceGroups(args: {
  statements: GroupableStatement[];
  scoreByStatementId: Map<string, number>;
  activeCountBySourceId: Map<string, number>;
}): StatementGroup[] {
  const { statements, scoreByStatementId, activeCountBySourceId } = args;

  const groupBySourceId = new Map<
    string,
    {
      key: SourceGroupKey;
      members: Array<{ statement: SearchedStatement; orderIndex: number }>;
    }
  >();

  for (const statement of statements) {
    const score = scoreByStatementId.get(statement.id);
    if (score === undefined) {
      continue;
    }

    for (const ref of statement.sources) {
      let group = groupBySourceId.get(ref.sourceId);
      if (!group) {
        group = {
          key: {
            kind: "source",
            sourceId: ref.sourceId,
            sourceCreatedAt: ref.sourceCreatedAt,
          },
          members: [],
        };
        groupBySourceId.set(ref.sourceId, group);
      }
      group.members.push({
        statement: {
          id: statement.id,
          content: statement.content,
          type: statement.type,
          confidence: statement.confidence,
          createdAt: statement.createdAt,
          score,
        },
        // locator는 nullable 자리(schema 4.2) — 안 채우는 쓰기 경로가 생기면 원문 순서를 모르므로 뒤로
        orderIndex: ref.orderIndex ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  const groups = [...groupBySourceId.values()].map((group) => {
    const members = [...group.members].sort(
      (a, b) =>
        a.orderIndex - b.orderIndex ||
        a.statement.createdAt.localeCompare(b.statement.createdAt),
    );
    return {
      maxScore: Math.max(...members.map((m) => m.statement.score)),
      group: {
        key: group.key,
        // 묶음이 있는 원본에 0은 구조상 불가능 — 집계가 비면 닿은 수가 하한
        totalStatementCount:
          activeCountBySourceId.get(group.key.sourceId) ?? members.length,
        statements: members.map((m) => m.statement),
      },
    };
  });

  // 묶음 간: 최고 관련도 내림차순 — 관련 있는 덩어리가 위로
  groups.sort((a, b) => b.maxScore - a.maxScore);

  return groups.map((g) => g.group);
}

function parseLocatorIndex(locator: Json | null): number | null {
  if (
    locator !== null &&
    typeof locator === "object" &&
    !Array.isArray(locator) &&
    typeof locator["index"] === "number"
  ) {
    return locator["index"];
  }
  return null;
}

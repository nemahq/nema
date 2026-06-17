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

// 꺼내기 표식 (relation-design §8) — 진술에 걸린 active 관계를 사실로만 나른다
// (가릴지 접을지는 화면 몫). 빈 표식은 응답에서 생략(선택 필드).
interface RelationMarkers {
  // replaces가 나를 가리킴(to_id=나) → "지난 것" + 후임자(from_id)
  supersededBy?: string[];
  // conflicts가 걸림(방향 무관) → "충돌 중" + 상대
  conflictsWith?: string[];
  // resolves가 나를 가리킴(to_id=나) → "닫힘" + 닫은 진술(from_id)
  resolvedBy?: string[];
}

export interface SearchedStatement extends RelationMarkers {
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

export interface StatementGroup {
  key: StatementGroupKey;
  totalStatementCount: number;
  statements: SearchedStatement[];
}

export interface StatementSearchResult {
  groups: StatementGroup[];
}

export async function searchStatements(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  query: string;
  topicIds?: string[];
}): Promise<StatementSearchResult> {
  const { supabase, providers, query, topicIds } = args;

  // 격리는 내가 멤버인 Space 목록 — 오늘은 개인 Space 1개지만 처음부터 목록으로
  const { data: memberships, error: membershipError } = await supabase
    .from("space_members")
    .select("space_id");
  throwIfSupabaseError(membershipError);

  const spaceIds = (memberships ?? []).map((m) => m.space_id);
  if (spaceIds.length === 0) {
    return { groups: [] };
  }

  // 줄기 범위 — 주제가 주어지면 그 주제의 진술로 검색을 한정한다 (narration-design 3장).
  // 빈 집합이면 그 줄기에 진술이 없다는 뜻이라 검색 없이 끝낸다.
  let scopedStatementIds: string[] | undefined;
  if (topicIds !== undefined) {
    scopedStatementIds = await collectScopedStatementIds(supabase, topicIds);
    if (scopedStatementIds.length === 0) {
      return { groups: [] };
    }
  }

  // 전처리 LLM 없이 그대로 임베딩(쿼리 모드) → Qdrant. statement_id+score만 받는다
  const hits = await providers.vectorStore.search(providers.embedding, {
    spaceIds,
    query,
    limit: STATEMENT_SEARCH_LIMIT,
    scoreThreshold: STATEMENT_SEARCH_SCORE_THRESHOLD,
    statementIds: scopedStatementIds,
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

  // 닿은 진술이 전부 archived면(원장 active 필터) 묶을 것도 표식도 없다 — 빈 in.() 필터 회피
  if (statements.length === 0) {
    return { groups: [] };
  }

  // 표식 — 방금 읽은 진술 id에 걸린 active 관계 1-hop 조회 (relation-design §8).
  // from/to 어느 쪽이든 걸리면 모아 방향대로 표식을 붙인다.
  const statementIds = statements.map((s) => s.id);
  const idList = statementIds.join(",");
  const { data: relationRows, error: relationError } = await supabase
    .from("statement_relations")
    .select("from_id, to_id, type")
    .eq("status", "active")
    .or(`from_id.in.(${idList}),to_id.in.(${idList})`);
  throwIfSupabaseError(relationError);

  const markersByStatementId = buildRelationMarkers(
    relationRows ?? [],
    new Set(statementIds),
  );

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
      markersByStatementId,
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
  markersByStatementId?: Map<string, RelationMarkers>;
}): StatementGroup[] {
  const {
    statements,
    scoreByStatementId,
    activeCountBySourceId,
    markersByStatementId,
  } = args;

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
          ...markersByStatementId?.get(statement.id),
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

type SearchedRelationType = Database["public"]["Enums"]["relation_type"];

// 관계 행 → 진술별 표식. 방향이 핵심 (relation-design §8):
// replaces/resolves는 to_id(가리켜진 쪽)에, conflicts는 양끝에 상대 id를 단다.
// supports는 1차에서 표식 없음(쓸모는 묶음이고, 묶음 기준은 보류).
export function buildRelationMarkers(
  relations: Array<{
    from_id: string;
    to_id: string;
    type: SearchedRelationType;
  }>,
  statementIdSet: Set<string>,
): Map<string, RelationMarkers> {
  const markers = new Map<string, RelationMarkers>();

  const append = (mark: {
    id: string;
    key: keyof RelationMarkers;
    value: string;
  }): void => {
    let entry = markers.get(mark.id);
    if (!entry) {
      entry = {};
      markers.set(mark.id, entry);
    }
    (entry[mark.key] ??= []).push(mark.value);
  };

  for (const relation of relations) {
    switch (relation.type) {
      case "replaces":
        if (statementIdSet.has(relation.to_id)) {
          append({
            id: relation.to_id,
            key: "supersededBy",
            value: relation.from_id,
          });
        }
        break;
      case "resolves":
        if (statementIdSet.has(relation.to_id)) {
          append({
            id: relation.to_id,
            key: "resolvedBy",
            value: relation.from_id,
          });
        }
        break;
      case "conflicts":
        // 대칭 — 결과에 든 끝점마다 상대를 단다
        if (statementIdSet.has(relation.from_id)) {
          append({
            id: relation.from_id,
            key: "conflictsWith",
            value: relation.to_id,
          });
        }
        if (statementIdSet.has(relation.to_id)) {
          append({
            id: relation.to_id,
            key: "conflictsWith",
            value: relation.from_id,
          });
        }
        break;
      case "supports":
        break;
    }
  }

  return markers;
}

export function parseLocatorIndex(locator: Json | null): number | null {
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

// archived 진술은 벡터 색인에 없어 검색에서 자동 탈락하므로 여기서 status를 따로 거르지 않는다.
async function collectScopedStatementIds(
  supabase: TypedSupabaseClient,
  topicIds: string[],
): Promise<string[]> {
  if (topicIds.length === 0) {
    return [];
  }

  const { data: topicSources, error: sourceError } = await supabase
    .from("source_topics")
    .select("source_id")
    .in("topic_id", topicIds);
  throwIfSupabaseError(sourceError);

  const sourceIds = [
    ...new Set((topicSources ?? []).map((row) => row.source_id)),
  ];
  if (sourceIds.length === 0) {
    return [];
  }

  const { data: scoped, error: scopedError } = await supabase
    .from("statement_sources")
    .select("statement_id")
    .in("source_id", sourceIds);
  throwIfSupabaseError(scopedError);

  return [...new Set((scoped ?? []).map((row) => row.statement_id))];
}

import type { Database } from "@server/infra/database.types";
import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

import {
  type SearchedStatement,
  searchStatements,
  type StatementSearchResult,
} from "./statement-search";

type StatementType = Database["public"]["Enums"]["statement_type"];

// 표식이 가리키는 상대 진술 — 검색엔 안 닿았지만 "왜 그렇게 됐는지"의 근거다 (narration-design 4장).
// 본문이 없으면 LLM이 id만 보고 지어내므로, 산문이 풀어 읽을 수 있게 내용과 원본을 채워 둔다.
export interface RelatedStatement {
  id: string;
  content: string;
  type: StatementType;
  createdAt: string;
  sourceIds: string[];
}

export interface Evidence {
  groups: StatementSearchResult["groups"];
  relatedStatements: RelatedStatement[];
}

// 해설과 맥락 내보내기(NEM-161)가 함께 쓰는 공용 코어. LLM도 스트리밍도 없는 순수 조립이다.
export async function assembleEvidence(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  query: string;
}): Promise<Evidence> {
  const { supabase, providers, query } = args;

  const search = await searchStatements({
    supabase,
    providers,
    query,
  });

  const relatedStatements = await fillRelatedStatements(supabase, search);

  return { groups: search.groups, relatedStatements };
}

// 이미 결과에 실린 진술은 본문이 있으니 제외하고, 표식이 가리키는 바깥 진술만 채운다.
// 상대가 지난(archived) 것이어도 근거로 삼으므로 status는 거르지 않는다 (narration-design 4장).
async function fillRelatedStatements(
  supabase: TypedSupabaseClient,
  search: StatementSearchResult,
): Promise<RelatedStatement[]> {
  const presentIds = new Set<string>();
  for (const group of search.groups) {
    for (const statement of group.statements) {
      presentIds.add(statement.id);
    }
  }

  const relatedIds = new Set<string>();
  for (const group of search.groups) {
    for (const statement of group.statements) {
      for (const id of markerTargets(statement)) {
        if (!presentIds.has(id)) {
          relatedIds.add(id);
        }
      }
    }
  }

  if (relatedIds.size === 0) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from("statements")
    .select("id, content, type, created_at, statement_sources(source_id)")
    .in("id", [...relatedIds]);
  throwIfSupabaseError(error);

  return (rows ?? []).map((row) => ({
    id: row.id,
    content: row.content,
    type: row.type,
    createdAt: row.created_at,
    sourceIds: row.statement_sources.map((ref) => ref.source_id),
  }));
}

function markerTargets(statement: SearchedStatement): string[] {
  return [
    ...(statement.supersededBy ?? []),
    ...(statement.conflictsWith ?? []),
    ...(statement.resolvedBy ?? []),
  ];
}

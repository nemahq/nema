import { type RelationType, RelationTypeSchema } from "@nema-io/shared";

import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

type ChangesetType = Database["public"]["Enums"]["changeset_type"];
type ChangesetStatus = Database["public"]["Enums"]["changeset_status"];
type ChangeTargetType = Database["public"]["Enums"]["change_target_type"];

// 되돌림 여부 술어 — is_changeset_reverted(SQL §4.4)의 TS 쌍.
// X가 되돌려짐 ⟺ X를 가리키는 revert 중 *그 자신이 안 되돌려진* 것이 있다(재귀).
// redo가 revert를 또 가리키고 분기(redo 후 같은 대상을 다시 revert)도 나므로
// 단순 카운트가 아니라 이 재귀라야 맞다. revert 간선만으로 닫힌다.
export function buildRevertedPredicate(
  edges: { id: string; revertsId: string }[],
): (id: string) => boolean {
  const childrenByTarget = new Map<string, string[]>();
  for (const e of edges) {
    const list = childrenByTarget.get(e.revertsId) ?? [];
    list.push(e.id);
    childrenByTarget.set(e.revertsId, list);
  }
  const cache = new Map<string, boolean>();
  const isReverted = (id: string): boolean => {
    const cached = cache.get(id);
    if (cached !== undefined) {
      return cached;
    }
    // 순환 없음(revert는 늘 기존 변경셋만 가리킴) — 재귀 안전.
    const reverted = (childrenByTarget.get(id) ?? []).some(
      (child) => !isReverted(child),
    );
    cache.set(id, reverted);
    return reverted;
  };
  return isReverted;
}

// 걸린 관계는 연쇄 트리거가, 벡터 축출은 워커가 처리(§3.1).
export async function archiveStatement(args: {
  supabase: TypedSupabaseClient;
  statementId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("archive_statement", {
    p_statement_id: args.statementId,
  });
  throwIfSupabaseError(error);
}

// 진술 연쇄 없음 — 원본만 가린다(§3.2).
export async function archiveSource(args: {
  supabase: TypedSupabaseClient;
  sourceId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("archive_source", {
    p_source_id: args.sourceId,
  });
  throwIfSupabaseError(error);
}

// 되돌리기·redo 공용 — 타겟 타입별 역연산은 RPC가 한다(§4).
export async function revertChangeset(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
}): Promise<{ revertChangesetId: string }> {
  const { data, error } = await args.supabase.rpc("revert_changeset", {
    p_changeset_id: args.changesetId,
  });
  throwIfSupabaseError(error);
  return { revertChangesetId: data };
}

// 반환은 active가 보장된 관계 id — 없으면 생성, archived면 복귀(§5.1).
export async function applyPendingRelation(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
}): Promise<{ relationId: string }> {
  const { data, error } = await args.supabase.rpc("apply_pending_relation", {
    p_changeset_id: args.changesetId,
  });
  throwIfSupabaseError(error);
  return { relationId: data };
}

export async function rejectPendingRelation(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("reject_pending_relation", {
    p_changeset_id: args.changesetId,
  });
  throwIfSupabaseError(error);
}

interface PendingRelationEndpoint {
  id: string;
  content: string;
}

interface PendingRelationProposal {
  changesetId: string;
  relationType: RelationType;
  isConflict: boolean;
  from: PendingRelationEndpoint | null;
  to: PendingRelationEndpoint | null;
  // 끝점 중 하나라도 archived면 stale — 적용 시 RPC가 RAISE한다(§5.1 E).
  stale: boolean;
  createdAt: string;
}

// changes.data는 jsonb(런타임 미보장)라 as 단언 대신 가드로 모양을 검증한다.
function parseRelationProposal(
  data: unknown,
): { type: RelationType; fromId: string; toId: string } | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const typeResult = RelationTypeSchema.safeParse(record.type);
  const fromId = record.from_id;
  const toId = record.to_id;
  if (
    !typeResult.success ||
    typeof fromId !== "string" ||
    typeof toId !== "string"
  ) {
    return null;
  }
  return { type: typeResult.data, fromId, toId };
}

// 제안은 changes.data에만 살고(관계 행 없음), 끝점 진술 content는 별도 조회로
// 붙인다 — data의 from/to가 jsonb라 FK 조인이 안 된다.
export async function listPendingRelations(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ proposals: PendingRelationProposal[] }> {
  const { supabase } = args;

  const { data: rows, error } = await supabase
    .from("changesets")
    .select("id, created_at, changes(target_type, data)")
    .eq("type", "relation")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  throwIfSupabaseError(error);

  const proposals = (rows ?? []).flatMap((row) => {
    const change = row.changes.find((c) => c.target_type === "relation");
    const proposal = parseRelationProposal(change?.data);
    if (!proposal) {
      return [];
    }
    return [
      {
        changesetId: row.id,
        relationType: proposal.type,
        fromId: proposal.fromId,
        toId: proposal.toId,
        createdAt: row.created_at,
      },
    ];
  });

  if (proposals.length === 0) {
    return { proposals: [] };
  }

  const endpointIds = [
    ...new Set(proposals.flatMap((p) => [p.fromId, p.toId])),
  ];
  const { data: statements, error: stmtError } = await supabase
    .from("statements")
    .select("id, content, status")
    .in("id", endpointIds);
  throwIfSupabaseError(stmtError);

  const byId = new Map(
    (statements ?? []).map((s) => [
      s.id,
      { id: s.id, content: s.content, active: s.status === "active" },
    ]),
  );

  return {
    proposals: proposals.map((p) => {
      const from = byId.get(p.fromId) ?? null;
      const to = byId.get(p.toId) ?? null;
      return {
        changesetId: p.changesetId,
        relationType: p.relationType,
        isConflict: p.relationType === "conflicts",
        from: from && { id: from.id, content: from.content },
        to: to && { id: to.id, content: to.content },
        stale: !from?.active || !to?.active,
        createdAt: p.createdAt,
      };
    }),
  };
}

interface ActiveRelationEndpoint {
  id: string;
  content: string;
}

interface ActiveRelation {
  id: string;
  type: RelationType;
  from: ActiveRelationEndpoint;
  to: ActiveRelationEndpoint;
  createdAt: string;
}

// 적용된 관계(검토함을 안 거치고 자동 적용된 것 포함)를 양끝 content와 함께 — 하니스 보정용.
// statement_relations에서 직접 읽는다(changesets와 별개). 끝점 archive 시 관계도 연쇄
// archive되므로 active 관계의 양끝은 active이고 content가 늘 있다(없으면 데이터 이상 → 스킵).
export async function listActiveRelations(args: {
  supabase: TypedSupabaseClient;
  sourceId?: string;
  limit: number;
}): Promise<{ relations: ActiveRelation[] }> {
  const { supabase, sourceId, limit } = args;

  let sourceStatementIds: string[] | null = null;
  if (sourceId) {
    const { data: refs, error } = await supabase
      .from("statement_sources")
      .select("statement_id")
      .eq("source_id", sourceId);
    throwIfSupabaseError(error);
    sourceStatementIds = (refs ?? []).map((r) => r.statement_id);
    if (sourceStatementIds.length === 0) {
      return { relations: [] };
    }
  }

  let query = supabase
    .from("statement_relations")
    .select("id, type, from_id, to_id, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sourceStatementIds) {
    const idList = sourceStatementIds.join(",");
    query = query.or(`from_id.in.(${idList}),to_id.in.(${idList})`);
  }
  const { data: rows, error } = await query;
  throwIfSupabaseError(error);

  if (!rows || rows.length === 0) {
    return { relations: [] };
  }

  const endpointIds = [...new Set(rows.flatMap((r) => [r.from_id, r.to_id]))];
  const { data: statements, error: stmtError } = await supabase
    .from("statements")
    .select("id, content")
    .in("id", endpointIds);
  throwIfSupabaseError(stmtError);

  const contentById = new Map((statements ?? []).map((s) => [s.id, s.content]));

  return {
    relations: rows.flatMap((row) => {
      const fromContent = contentById.get(row.from_id);
      const toContent = contentById.get(row.to_id);
      if (fromContent === undefined || toContent === undefined) {
        return [];
      }
      return [
        {
          id: row.id,
          type: row.type,
          from: { id: row.from_id, content: fromContent },
          to: { id: row.to_id, content: toContent },
          createdAt: row.created_at,
        },
      ];
    }),
  };
}

interface ChangesetHistoryEntry {
  id: string;
  type: ChangesetType;
  status: ChangesetStatus;
  sourceId: string | null;
  revertsId: string | null;
  // 되돌림 여부 — is_changeset_reverted(SQL)와 같은 재귀를 revert 간선으로 계산(§4.4).
  reverted: boolean;
  // 효과 요약 — 대상 종류별 변경 수("이 글 → 진술 N + 관계 M").
  effect: Record<ChangeTargetType, number>;
  createdAt: string;
}

export async function listChangesets(args: {
  supabase: TypedSupabaseClient;
  limit: number;
}): Promise<{ changesets: ChangesetHistoryEntry[] }> {
  const { supabase, limit } = args;

  const { data: rows, error } = await supabase
    .from("changesets")
    .select(
      "id, type, status, source_id, reverts_id, created_at, changes(target_type)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  throwIfSupabaseError(error);

  // 되돌림 여부는 revert 간선 전체를 모아 재귀로 계산한다(페이지 밖 redo 사슬 포함).
  const { data: edges, error: edgeError } = await supabase
    .from("changesets")
    .select("id, reverts_id")
    .not("reverts_id", "is", null);
  throwIfSupabaseError(edgeError);

  const isReverted = buildRevertedPredicate(
    (edges ?? []).flatMap((e) =>
      e.reverts_id ? [{ id: e.id, revertsId: e.reverts_id }] : [],
    ),
  );

  return {
    changesets: (rows ?? []).map((row) => {
      const effect: Record<ChangeTargetType, number> = {
        statement: 0,
        relation: 0,
        source: 0,
      };
      for (const c of row.changes) {
        effect[c.target_type] += 1;
      }
      return {
        id: row.id,
        type: row.type,
        status: row.status,
        sourceId: row.source_id,
        revertsId: row.reverts_id,
        reverted: isReverted(row.id),
        effect,
        createdAt: row.created_at,
      };
    }),
  };
}

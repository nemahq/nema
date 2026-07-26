import {
  type DigestBody,
  DigestBodySchema,
  type DigestDraft,
  type ManualChangeHistoryTargetType,
  type NewReferenceDraft,
  type RelationType,
  RelationTypeSchema,
} from "@nema-io/shared";

import type { Database, Json } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

type ChangesetType = Database["public"]["Enums"]["changeset_type"];
type ChangesetStatus = Database["public"]["Enums"]["changeset_status"];
type ChangeTargetType = Database["public"]["Enums"]["change_target_type"];
type ChangeAction = Database["public"]["Enums"]["change_action"];
type SourceStatus = Database["public"]["Enums"]["source_status"];

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

// 되돌리기·redo 공용 — 타겟 타입별 역연산은 RPC가 한다(§4).
// number까지 함께 돌려주는 이유: Changeset 상세 URL이 UUID가 아니라 number 기준이라,
// 되돌리기 성공 후 새로 생긴 revert changeset으로 바로 이동하려면 number가 필요하다
// (RevertChangesetInputSchema 등 기존 UUID 입력 계약은 그대로 — 응답만 확장).
export async function revertChangeset(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
}): Promise<{ revertChangesetId: string; revertChangesetNumber: number }> {
  const { supabase, changesetId } = args;

  const { data, error } = await supabase.rpc("revert_changeset", {
    p_changeset_id: changesetId,
  });
  throwIfSupabaseError(error);

  const { data: revertRow, error: numberError } = await supabase
    .from("changesets")
    .select("number")
    .eq("id", data)
    .single();
  throwIfSupabaseError(numberError);
  if (revertRow.number === null) {
    throw new Error(`revert changeset ${data} has no number`);
  }

  return { revertChangesetId: data, revertChangesetNumber: revertRow.number };
}

// 충돌 판정 — 승자 선택. 패자는 archive되고 승자→패자 replaces 관계가 세워진다
// (review-flow.md "충돌 판정 — 승자 선택").
export async function resolveConflictRelation(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
  winnerStatementId: string;
}): Promise<{ relationId: string }> {
  const { data, error } = await args.supabase.rpc("resolve_conflict_relation", {
    p_changeset_id: args.changesetId,
    p_winner_statement_id: args.winnerStatementId,
  });
  throwIfSupabaseError(error);
  return { relationId: data };
}

// 중복 판정 — 병합. mergedDigest/newReferences는 confirmDigestEdit과 같은 snake_case
// RPC 계약(review-flow.md "중복 판정 — 병합").
export async function resolveDuplicateRelation(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
  mergedDigest: DigestDraft;
  newReferences: NewReferenceDraft[];
}): Promise<{ digestId: string }> {
  const { supabase, changesetId, mergedDigest, newReferences } = args;

  const { data, error } = await supabase.rpc("resolve_duplicate_relation", {
    p_changeset_id: changesetId,
    p_merged_digest: {
      title: mergedDigest.title,
      description: mergedDigest.description,
      body: mergedDigest.body,
      topics: mergedDigest.topics.map((topic) => topic.title),
      tags: mergedDigest.tags.map((tag) => ({
        title: tag.title,
        description: tag.description,
      })),
      reference_ids: mergedDigest.referenceIds,
      new_reference_keys: mergedDigest.newReferenceKeys,
      external_urls: mergedDigest.externalUrls,
    } as unknown as Json,
    p_new_references: newReferences.map((reference) => ({
      key: reference.key,
      type: reference.type,
      title: reference.title,
      body: reference.body,
      external_urls: reference.externalUrls,
    })) as unknown as Json,
  });
  throwIfSupabaseError(error);
  return { digestId: data };
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

// 중복(duplicates) 제안 하니스 판정의 병합 기본값 재료 — 병합 제안 편집 UI가 아직
// 없는 소비처(/dev 하니스)가 keeper(from) Digest 내용을 그대로 기본 병합안으로 쓸 수
// 있게, 끝점 진술이 속한 Digest 스냅샷을 함께 실어둔다.
interface PendingRelationEndpointDigest {
  id: string;
  title: string;
  description: string;
  body: DigestBody;
  externalUrls: string[];
}

interface PendingRelationEndpoint {
  id: string;
  content: string;
  digest: PendingRelationEndpointDigest;
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
// changeset-detail-service도 재사용(승인·거절 후에도 이 change row는 그대로 남음).
export function parseRelationProposal(
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
    .select(
      "id, content, status, digest:digests(id, title, description, body, external_urls)",
    )
    .in("id", endpointIds);
  throwIfSupabaseError(stmtError);

  const byId = new Map(
    (statements ?? []).map((s) => [
      s.id,
      {
        id: s.id,
        content: s.content,
        active: s.status === "active",
        digest: {
          id: s.digest.id,
          title: s.digest.title,
          description: s.digest.description,
          body: DigestBodySchema.parse(s.digest.body),
          externalUrls: s.digest.external_urls ?? [],
        },
      },
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
        from: from && {
          id: from.id,
          content: from.content,
          digest: from.digest,
        },
        to: to && { id: to.id, content: to.content, digest: to.digest },
        stale: !from?.active || !to?.active,
        createdAt: p.createdAt,
      };
    }),
  };
}

interface ActiveRelationEndpoint {
  id: string;
  // 못 찾으면 null — 행을 버리지 않고 표면화한다(아래 listActiveRelations 주석)
  content: string | null;
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
// archive되므로 active 관계의 양끝은 active이고 content가 늘 있어야 한다. 그래도 못 찾으면
// (데이터 이상) 행을 버리지 않고 content=null로 둬 화면에 드러낸다 — 보정 하니스가
// "엔진이 적게 만든 것"과 "뷰가 누락시킨 것"을 헷갈리지 않게(과소집계 은폐 방지).
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
    relations: rows.map((row) => ({
      id: row.id,
      type: row.type,
      from: { id: row.from_id, content: contentById.get(row.from_id) ?? null },
      to: { id: row.to_id, content: contentById.get(row.to_id) ?? null },
      createdAt: row.created_at,
    })),
  };
}

interface ChangesetHistoryEntry {
  id: string;
  // Space 안에서 순차 증가하는 표시용 번호(GitHub PR 번호와 같은 역할). listChangesets가
  // 항상 하나의 spaceId로 스코프하므로 이 목록엔 manual(Reference 직접 수정, space_id
  // 없음)이 섞일 일이 없어 null이 아니다(DB CHECK: space_id IS NULL = number IS NULL).
  number: number;
  type: ChangesetType;
  status: ChangesetStatus;
  sourceId: string | null;
  // ingestion의 "되살리기" 활성 여부는 원문이 pending인지에 달려있다(restore_ingestion_review
  // 가드) — 목록 단계에서 미리 알아야 클릭 전에 버튼을 비활성화할 수 있다.
  sourceStatus: SourceStatus | null;
  // 생성 시점에 채워지는 표시용 제목(타입별 채움 규칙은 changeset_title 마이그레이션
  // 참고). null이면 FE가 효과 요약으로 대체한다.
  title: string | null;
  revertsId: string | null;
  // revert 체인에서 몇 단계째 되돌리기/되살리기(redo)인지 — origin=0, 1차 revert=1,
  // 그 redo=2, ... FE가 문구를 조합할 재료(revert_changeset_depth 마이그레이션 참고).
  revertDepth: number;
  // 다른 병합(중복 판정)이 이 pending 제안의 끝점을 먼저 archive해 자동으로
  // rejected 처리됐으면 그 원인 changeset id — 사람이 거절한 일반 rejected와
  // 구분하는 신호(07-modeling.md "한 Digest가 여러 곳과 동시에 중복될 수 있다").
  invalidatedById: string | null;
  // 사람이 이 changeset의 내용 자체를 만든 경우에만 있음(07-modeling.md §authorId
  // 규칙) — ingestion·relation은 엔진 산물이라 항상 null, revert만 있음.
  authorId: string | null;
  // author_id와 함께 생성 시점에 저장되는 이름 스냅샷(ghost 패턴) — 계정이 삭제돼
  // authorId가 NULL로 끊긴 뒤에도 그 순간의 이름을 그대로 보여줄 수 있다.
  authorName: string | null;
  // 되돌림 여부 — is_changeset_reverted(SQL)와 같은 재귀를 revert 간선으로 계산(§4.4).
  reverted: boolean;
  // 효과 요약 — 대상 종류별 변경 수("이 글 → 진술 N + 관계 M").
  effect: Record<ChangeTargetType, number>;
  createdAt: string;
  // closed(applied/rejected) 전환 시점(의도). trg_changesets_updated_at은 status
  // 변경뿐 아니라 이 행에 대한 모든 UPDATE에 반응하므로, revert_changeset처럼 원본을
  // UPDATE하지 않는 경로(§4.4)에서만 "판단이 내려진 시각"이 보장된다 — 컬럼만 고치는
  // UPDATE(예: 백필)를 추가하면 이 값도 함께 갱신되니 주의.
  updatedAt: string;
}

// 이 목록은 메타데이터 전용으로 유지한다 — changes.data(실제 변경 콘텐츠)는 절대
// 여기 얹지 않는다. 단건 상세 콘텐츠(스냅샷 등)가 필요하면 getChangesetByNumber를
// 새로 만든다(changeset-detail-service.ts) — list 응답을 키워 재사용하지 않는다.
// 근거: design-decisions-log.md 2026-07-18 "listChangesets는 메타데이터 전용으로 유지" 참고.
export async function listChangesets(args: {
  supabase: TypedSupabaseClient;
  spaceId?: string;
  limit: number;
  // 미지정 시 open/closed 구분 없이 전부 — MCP 등 상태 필터가 필요 없는 소비처를 위한
  // 기본값(source.create 미지정 Space 폴백과 같은 결).
  open?: boolean;
  // number(Space 안 순차 증가값) 기준 커서 — created_at 대신 쓰는 이유는 동시 생성 시
  // 동률 가능성이 없는 정수라 페이지 경계가 항상 안정적이기 때문.
  cursor?: number | null;
}): Promise<{
  changesets: ChangesetHistoryEntry[];
  nextCursor: number | null;
}> {
  const { supabase, spaceId, limit, open, cursor } = args;

  // spaceId 미지정 호출(MCP·dev-harness)만 이 경로를 탄다 — createSource와 같은
  // 결의 폴백(1인 단계 기본 Space).
  let targetSpaceId = spaceId;
  if (targetSpaceId === undefined) {
    const { data: membership, error: memberError } = await supabase
      .from("space_members")
      .select("space_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    throwIfSupabaseError(memberError);
    targetSpaceId = membership.space_id;
  }

  let query = supabase
    .from("changesets")
    .select(
      "id, number, type, status, title, source_id, reverts_id, revert_depth, invalidated_by_id, author_id, author_name, created_at, updated_at, changes(target_type), sources(status)",
    )
    .eq("space_id", targetSpaceId)
    // manual은 review-flow.md상 이 목록의 대상이 아니다(대상 콘텐츠의 "변경 이력"
    // 모달에서만 조회). Reference manual(space_id NULL)은 위 eq로 이미 안 걸리지만,
    // Digest manual(confirm_digest_edit·archive_digest)은 space_id가 있어 그
    // 필터를 안 타므로 여기서 명시적으로 뺀다.
    .neq("type", "manual")
    .order("number", { ascending: false })
    // 다음 페이지 존재 여부를 별도 count 쿼리 없이 알려고 하나 더 얹어 받는다.
    .limit(limit + 1);
  if (open !== undefined) {
    query = open
      ? query.eq("status", "pending")
      : query.in("status", ["applied", "rejected"]);
  }
  if (cursor != null) {
    query = query.lt("number", cursor);
  }

  const { data: rows, error } = await query;
  throwIfSupabaseError(error);

  const hasMore = (rows ?? []).length > limit;
  const pageRows = hasMore ? (rows ?? []).slice(0, limit) : (rows ?? []);
  const nextCursor = hasMore ? (pageRows.at(-1)?.number ?? null) : null;

  // 되돌림 여부는 revert 간선 전체를 모아 재귀로 계산한다(페이지 밖 redo 사슬 포함).
  // revert 변경셋은 되돌리는 대상과 항상 같은 space_id를 갖는다(revert_changeset RPC)
  // 이므로 이 space로 스코프해도 재귀가 끊기지 않는다.
  // 페이지마다(즉 fetchNextPage 호출마다) 이 space의 간선 전체를 다시 조회한다 — 재귀가
  // 페이지 경계를 넘어설 수 있어 부분 조회로는 정확히 계산할 수 없기 때문. 행 단위로
  // SQL의 is_changeset_reverted를 호출하면 N+1이 되니 지금 방식(간선 1회 조회 + 인메모리
  // 재귀)이 더 낫다. Space당 changeset 수가 아직 적어 비용은 낮지만, 커지면 요청 단위로
  // 캐싱하거나 뷰/구체화 테이블로 옮기는 걸 고려할 것.
  const { data: edges, error: edgeError } = await supabase
    .from("changesets")
    .select("id, reverts_id")
    .eq("space_id", targetSpaceId)
    .not("reverts_id", "is", null);
  throwIfSupabaseError(edgeError);

  const isReverted = buildRevertedPredicate(
    (edges ?? []).flatMap((e) =>
      e.reverts_id ? [{ id: e.id, revertsId: e.reverts_id }] : [],
    ),
  );

  return {
    nextCursor,
    changesets: pageRows.map((row) => {
      if (row.number === null) {
        throw new Error(
          `changeset ${row.id} has no number despite being scoped to space ${targetSpaceId}`,
        );
      }
      const effect: Record<ChangeTargetType, number> = {
        statement: 0,
        relation: 0,
        source: 0,
        digest: 0,
        reference: 0,
      };
      for (const c of row.changes) {
        effect[c.target_type] += 1;
      }
      return {
        id: row.id,
        number: row.number,
        type: row.type,
        status: row.status,
        sourceId: row.source_id,
        sourceStatus: row.sources?.status ?? null,
        title: row.title,
        revertsId: row.reverts_id,
        revertDepth: row.revert_depth,
        invalidatedById: row.invalidated_by_id,
        authorId: row.author_id,
        authorName: row.author_name,
        reverted: isReverted(row.id),
        effect,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),
  };
}

interface ManualChangeHistoryEntry {
  id: string;
  changesetId: string;
  // 이 changeset이 Reference를 대상으로 하면 space_id가 없어(Workspace 스코프)
  // number도 없다(DB CHECK: space_id IS NULL ⟺ number IS NULL) — Digest 대상만 있음.
  changesetNumber: number | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  action: ChangeAction;
  data: unknown;
}

// 변경 이력 모달(Digest 상세·Reference 상세 공용, surface-inventory.md "변경 이력")
// — RLS(is_space_member)가 space_id NULL인 Reference manual changeset을 걸러내므로
// (get_reference_citing_digests와 같은 이유) RPC로 멤버십을 직접 검증해 우회한다.
// manual뿐 아니라 revert(되살리기 포함)도 함께 내려온다 — RPC 주석 참고.
export async function listManualChangeHistory(args: {
  supabase: TypedSupabaseClient;
  targetType: ManualChangeHistoryTargetType;
  targetId: string;
}): Promise<{ entries: ManualChangeHistoryEntry[] }> {
  const { supabase, targetType, targetId } = args;

  const { data, error } = await supabase.rpc("list_manual_changes_for_target", {
    p_target_type: targetType,
    p_target_id: targetId,
  });
  throwIfSupabaseError(error);

  return {
    entries: (data ?? []).map((row) => ({
      id: row.id,
      changesetId: row.changeset_id,
      changesetNumber: row.changeset_number,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      action: row.action,
      data: row.data,
    })),
  };
}

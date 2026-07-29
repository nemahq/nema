import * as Sentry from "@sentry/node";

import {
  type DigestBody,
  DigestBodySchema,
  type DigestDraft,
  type RelationType,
  type TagColor,
} from "@nema-io/shared";

import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  SupabaseError,
  throwIfSupabaseError,
} from "@server/infra/supabase-error";
import { parseRelationProposal } from "@server/services/changeset-service";

type ChangesetType = Database["public"]["Enums"]["changeset_type"];
type ChangesetStatus = Database["public"]["Enums"]["changeset_status"];
type ChangesetOutcome = Database["public"]["Enums"]["changeset_outcome"];
type DigestStatus = Database["public"]["Enums"]["digest_status"];
type StatementStatus = Database["public"]["Enums"]["statement_status"];

interface DigestSnapshot {
  id: string;
  title: string;
  description: string;
  body: DigestBody;
  topics: { id: string; title: string }[];
  tags: { id: string; title: string; description: string; color: TagColor }[];
  referenceIds: string[];
  externalUrls: string[];
  authorId: string | null;
  authorName: string | null;
  status: DigestStatus;
  createdAt: string;
  sourceId: string;
}

interface RelationEndpointSnapshot {
  statementId: string;
  statementContent: string;
  statementStatus: StatementStatus;
  // fetchRelationEndpoint 주석 참고 — 이 진술이 Digest의 어느 칸에서 나왔는지 짚는 값.
  sourceField: string | null;
  sourceFieldIndex: number | null;
  digest: DigestSnapshot;
}

// 이번 라운드가 채운 9케이스(ingestion 2 + relation 6 + revert 1) 밖은 전부
// "unsupported"로 묶는다 — manual(changeset 목록에 애초에 안 뜸),
// open(이 화면은 closed 전용, open은 별도 리뷰 화면이 담당) 등.
type ChangesetDetailBody =
  | { kind: "ingestion_applied"; digests: DigestSnapshot[] }
  | { kind: "ingestion_discarded" }
  | {
      kind: "relation_conflict_applied";
      from: RelationEndpointSnapshot;
      to: RelationEndpointSnapshot;
    }
  | { kind: "relation_conflict_discarded" }
  | {
      kind: "relation_duplicate_applied";
      keeper: RelationEndpointSnapshot;
      duplicate: RelationEndpointSnapshot;
    }
  | { kind: "relation_duplicate_discarded" }
  | {
      // 한 changeset이 확신 관계를 N개 담을 수 있다(apply_relation_changesets의
      // 자동 적용 루프가 배치당 changeset 1개에 성공한 관계마다 change 행 하나씩
      // 쌓는다) — conflicts/duplicates(항상 쌍 하나=changeset 하나)와 다르다.
      kind: "relation_confident_applied";
      relations: {
        relationType: Extract<
          RelationType,
          "supports" | "replaces" | "resolves"
        >;
        from: RelationEndpointSnapshot;
        to: RelationEndpointSnapshot;
      }[];
    }
  | { kind: "relation_confident_discarded" }
  | { kind: "revert"; revertsNumber: number }
  | { kind: "unsupported" };

interface ChangesetDetail {
  id: string;
  number: number;
  spaceId: string;
  type: ChangesetType;
  status: ChangesetStatus;
  // status='closed'일 때만 값이 있다(DB chk_changeset_outcome).
  outcome: ChangesetOutcome | null;
  title: string | null;
  authorId: string | null;
  authorName: string | null;
  // 이 changeset을 닫은(판정한) 사람 — author*와 다른 축이다(author는 "내용을 만든
  // 사람", closedBy는 "닫기 버튼을 누른 사람"). status='closed'일 때만 값이 있을 수
  // 있고, 그마저도 NULL이면 AI(엔진)가 닫았다는 뜻이다(확신 관계 자동 적용 등).
  closedById: string | null;
  closedByName: string | null;
  sourceId: string | null;
  revertsId: string | null;
  revertsNumber: number | null;
  revertDepth: number;
  invalidatedById: string | null;
  createdAt: string;
  updatedAt: string;
  body: ChangesetDetailBody;
}

interface ChangeRow {
  action: Database["public"]["Enums"]["change_action"];
  target_type: Database["public"]["Enums"]["change_target_type"];
  target_id: string;
  data: unknown;
}

// digests + digest_topics/digest_tags/digest_references를 한 번에 모아 스냅샷으로
// 만든다. title/description/body/externalUrls는 이 id 자체가 archive+create 전까지
// 불변이라(그 전엔 다른 변경 경로가 없음) 사실상 그 시점에 얼려진 값과 같다 — 반면
// topics/tags 칩은 changeset 없이 가볍게 추가·삭제되므로(surface-inventory.md
// "가볍게, 그 자리에서 바로") 이 부분만 조회 시점의 "지금" 값이다.
async function fetchDigestSnapshots(args: {
  supabase: TypedSupabaseClient;
  digestIds: string[];
}): Promise<Map<string, DigestSnapshot>> {
  const { supabase, digestIds } = args;
  if (digestIds.length === 0) {
    return new Map();
  }

  const { data: rows, error } = await supabase
    .from("digests")
    .select(
      "id, title, description, body, external_urls, author_id, author_name, status, created_at, source_id, digest_topics(topic:topics(id, title)), digest_tags(tag:tags(id, title, description, color)), digest_references(reference_id)",
    )
    .in("id", digestIds);
  throwIfSupabaseError(error);

  return new Map(
    (rows ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title,
        description: row.description,
        body: DigestBodySchema.parse(row.body),
        topics: row.digest_topics.map((dt) => ({
          id: dt.topic.id,
          title: dt.topic.title,
        })),
        tags: row.digest_tags.map((dt) => ({
          id: dt.tag.id,
          title: dt.tag.title,
          description: dt.tag.description,
          color: dt.tag.color,
        })),
        referenceIds: row.digest_references.map((dr) => dr.reference_id),
        externalUrls: row.external_urls ?? [],
        authorId: row.author_id,
        authorName: row.author_name,
        status: row.status,
        createdAt: row.created_at,
        sourceId: row.source_id,
      },
    ]),
  );
}

// relation(충돌·중복) 카드는 진술이 아니라 그 진술이 속한 Digest를 통째로 보여준다
// (관계 판정 화면의 .rj-digest-card 재사용 전제, surface-inventory.md "Changeset 상세"
// 참고) — 그 안에서 이 진술이 어느 문장인지는 sourceField로 칸을 바로 짚고, sourceField가
// 없으면(이 마이그레이션 이전에 추출된 진술 등) statementId/statementContent로 대신 짚는다.
async function fetchRelationEndpoint(args: {
  supabase: TypedSupabaseClient;
  statementId: string;
}): Promise<RelationEndpointSnapshot> {
  const { supabase, statementId } = args;

  // maybeSingle — single()이 PGRST116(행 없음)을 not_found로 매핑해, source_purge로
  // 하드 삭제된 진술을 가리키는 change 행(참조 무결성 위반, 진짜 장애)이 "이 changeset을
  // 찾을 수 없음"으로 조용히 위장되고 Sentry도 스킵되는 문제가 있었다(EXPECTED_DOMAIN_CODES).
  // 아래 digest 조회와 같은 패턴으로 query_failed를 직접 던져 새지 않게 한다.
  const { data: statement, error } = await supabase
    .from("statements")
    .select("id, content, status, digest_id, source_field, source_field_index")
    .eq("id", statementId)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!statement) {
    throw new SupabaseError(
      "query_failed",
      `statement ${statementId} referenced by a relation change not found`,
    );
  }

  const digests = await fetchDigestSnapshots({
    supabase,
    digestIds: [statement.digest_id],
  });
  const digest = digests.get(statement.digest_id);
  if (!digest) {
    // 정상 경로에선 절대 안 생기는 참조 무결성 위반(진짜 장애) — DB_QUERY_FAILED로
    // 던져 원문 메시지가 클라이언트에 새지 않게 하고 Sentry로도 잡히게 한다.
    throw new SupabaseError(
      "query_failed",
      `digest ${statement.digest_id} not found for statement ${statementId}`,
    );
  }

  return {
    statementId: statement.id,
    statementContent: statement.content,
    statementStatus: statement.status,
    sourceField: statement.source_field,
    sourceFieldIndex: statement.source_field_index,
    digest,
  };
}

async function resolveBody(args: {
  supabase: TypedSupabaseClient;
  type: ChangesetType;
  outcome: ChangesetOutcome | null;
  changes: ChangeRow[];
  revertsNumber: number | null;
}): Promise<ChangesetDetailBody> {
  const { supabase, type, outcome, changes, revertsNumber } = args;

  if (type === "ingestion") {
    if (outcome === "discarded") {
      return { kind: "ingestion_discarded" };
    }
    if (outcome === "applied") {
      const digestIds = changes
        .filter((c) => c.target_type === "digest" && c.action === "create")
        .map((c) => c.target_id);
      const snapshots = await fetchDigestSnapshots({ supabase, digestIds });
      const digests = digestIds.map((id) => {
        const snapshot = snapshots.get(id);
        if (!snapshot) {
          throw new SupabaseError(
            "query_failed",
            `digest ${id} created by this changeset not found`,
          );
        }
        return snapshot;
      });
      return { kind: "ingestion_applied", digests };
    }
    return { kind: "unsupported" };
  }

  if (type === "relation") {
    // 열린 제안의 {type, from_id, to_id}는 닫힌 뒤에도 changes 행에 그대로 남는다
    // (resolve_*_relation/reject_pending_relation 전부 이 change row를 안 건드림)
    // — outcome과 무관하게 항상 이걸로 관계 종류를 가른다.
    // relation 행이 하나도 없거나 전부 파싱 실패하는 건 "아직 안 다루는 타입"과 달리
    // 불변식 위반(진짜 버그)이라 unsupported로 뭉개지 않고 던진다.
    const relationChanges = changes.filter((c) => c.target_type === "relation");
    const proposals = relationChanges
      .map((c) => parseRelationProposal(c.data))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (proposals.length === 0) {
      throw new SupabaseError(
        "query_failed",
        "relation changeset has no parseable relation change row",
      );
    }

    // conflicts/duplicates는 건당 changeset 1개(사람 판정 대상)라 relation 행이
    // 하나뿐이어야 정상이지만, resolve_conflict_relation은 판정 결과로 원래
    // conflicts 제안 행을 남긴 채 새 replaces 행을 changes에 추가한다(같은
    // changeset에 relation 행이 2개가 됨) — data->>'type'으로 원래 제안을 우선
    // 찾아야지, 행 순서(embed 순서 비보장)에 기대면 안 된다.
    const pendingProposal = proposals.find(
      (p) => p.type === "conflicts" || p.type === "duplicates",
    );

    if (pendingProposal?.type === "conflicts") {
      if (outcome === "discarded") {
        return { kind: "relation_conflict_discarded" };
      }
      if (outcome === "applied") {
        const [from, to] = await Promise.all([
          fetchRelationEndpoint({
            supabase,
            statementId: pendingProposal.fromId,
          }),
          fetchRelationEndpoint({
            supabase,
            statementId: pendingProposal.toId,
          }),
        ]);
        return { kind: "relation_conflict_applied", from, to };
      }
      return { kind: "unsupported" };
    }

    if (pendingProposal?.type === "duplicates") {
      if (outcome === "discarded") {
        return { kind: "relation_duplicate_discarded" };
      }
      if (outcome === "applied") {
        // 방향 규약(resolve_duplicate_relation 주석): from=keeper(남는 쪽), to=duplicate(가려진 쪽).
        const [keeper, duplicate] = await Promise.all([
          fetchRelationEndpoint({
            supabase,
            statementId: pendingProposal.fromId,
          }),
          fetchRelationEndpoint({
            supabase,
            statementId: pendingProposal.toId,
          }),
        ]);
        return { kind: "relation_duplicate_applied", keeper, duplicate };
      }
      return { kind: "unsupported" };
    }

    // supports/replaces/resolves — 확신 관계. 낮은 확신도는 conflicts/duplicates와
    // 똑같이 open 제안으로 갔다가 reject_pending_relation으로 discarded될 수 있다
    // (apply_relation_changesets p_pending 분기, worker.ts의 confident 게이트).
    // 확신 적용은 apply_relation_changesets의 자동 루프가 배치당 changeset 1개에
    // 성공한 관계마다 change 행을 쌓으므로(사람 판정 1쌍=1changeset과 다름) 전부 모은다.
    if (outcome === "discarded") {
      return { kind: "relation_confident_discarded" };
    }
    if (outcome === "applied") {
      const relations = await Promise.all(
        proposals.map(async (proposal) => {
          const [from, to] = await Promise.all([
            fetchRelationEndpoint({ supabase, statementId: proposal.fromId }),
            fetchRelationEndpoint({ supabase, statementId: proposal.toId }),
          ]);
          return {
            // pendingProposal이 없는 이 분기에서 proposals는 전부 conflicts/duplicates가
            // 아님이 이미 보장된다(위에서 걸러짐) — 타입 좁히기.
            relationType: proposal.type as Extract<
              RelationType,
              "supports" | "replaces" | "resolves"
            >,
            from,
            to,
          };
        }),
      );
      return { kind: "relation_confident_applied", relations };
    }
    return { kind: "unsupported" };
  }

  if (type === "revert") {
    // revert 타입은 chk_changeset_shape가 reverts_id NOT NULL을 강제하므로
    // revertsNumber도 항상 있다 — 타입에 실어 FE가 null 가드 없이 쓰게 한다
    // (기존 outer ChangesetDetail.revertsNumber는 다른 소비처 안전을 위해 유지).
    if (revertsNumber === null) {
      throw new SupabaseError(
        "query_failed",
        "revert changeset has no revertsNumber despite reverts_id being NOT NULL",
      );
    }
    return { kind: "revert", revertsNumber };
  }

  // manual — changeset 목록에 애초에 안 뜨는 타입이라(07-modeling.md) 이 경로를 탈 일이
  // 실질적으로 없지만 방어적으로 둔다.
  return { kind: "unsupported" };
}

export async function getChangesetByNumber(args: {
  supabase: TypedSupabaseClient;
  spaceId: string;
  number: number;
}): Promise<ChangesetDetail> {
  const { supabase, spaceId, number } = args;

  const { data: row, error } = await supabase
    .from("changesets")
    .select(
      "id, number, type, status, outcome, title, source_id, reverts_id, revert_depth, invalidated_by_id, author_id, author_name, closed_by_id, closed_by_name, created_at, updated_at, changes(action, target_type, target_id, data)",
    )
    .eq("space_id", spaceId)
    .eq("number", number)
    .maybeSingle();
  throwIfSupabaseError(error);

  if (!row) {
    // 세션-서비스의 같은 패턴(session-service.ts)을 따른다 — TRPCError를 직접
    // 던지면 errorFormatter의 도메인 코드 매핑을 안 타 원문 메시지가 그대로 샌다.
    throw new SupabaseError(
      "not_found",
      `changeset #${number} not found in space ${spaceId}`,
    );
  }
  if (row.number === null) {
    // space_id IS NULL ⟺ number IS NULL(DB CHECK) — 특정 space_id로 걸러 찾은
    // 행이라 이론상 불가능하지만, listChangesets의 같은 방어 체크와 일관되게 둔다.
    throw new Error(
      `changeset ${row.id} has no number despite being scoped to space ${spaceId}`,
    );
  }

  let revertsNumber: number | null = null;
  if (row.reverts_id) {
    const { data: revertsRow, error: revertsError } = await supabase
      .from("changesets")
      .select("number")
      .eq("id", row.reverts_id)
      .single();
    throwIfSupabaseError(revertsError);
    revertsNumber = revertsRow.number;
  }

  const body = await resolveBody({
    supabase,
    type: row.type,
    outcome: row.outcome,
    changes: row.changes,
    revertsNumber,
  });

  return {
    id: row.id,
    number: row.number,
    spaceId,
    type: row.type,
    status: row.status,
    outcome: row.outcome,
    title: row.title,
    authorId: row.author_id,
    authorName: row.author_name,
    closedById: row.closed_by_id,
    closedByName: row.closed_by_name,
    sourceId: row.source_id,
    revertsId: row.reverts_id,
    revertsNumber,
    revertDepth: row.revert_depth,
    invalidatedById: row.invalidated_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    body,
  };
}

type PendingRelationBody =
  | {
      kind: "conflict_pending";
      from: RelationEndpointSnapshot;
      to: RelationEndpointSnapshot;
    }
  | {
      // 07-modeling.md "duplicates A→B: A와 B가 같은 뜻이라 A만 남고 B가 지난 것이
      // 된다" 방향 규약대로 keeper=fromId, duplicate=toId(resolve_duplicate_relation과 동일).
      kind: "duplicate_pending";
      keeper: RelationEndpointSnapshot;
      duplicate: RelationEndpointSnapshot;
      // #523의 LLM eager 생성이 실패했으면 null — 화면(다음 슬라이스)이 null을 어떻게
      // 보여줄지는 이 서비스 책임이 아니다.
      mergeDraft: DigestDraft | null;
    };

interface PendingRelationChangeset {
  changesetId: string;
  changesetNumber: number;
  createdAt: string;
  body: PendingRelationBody;
}

export async function getPendingRelationByNumber(args: {
  supabase: TypedSupabaseClient;
  spaceId: string;
  number: number;
}): Promise<PendingRelationChangeset> {
  const { supabase, spaceId, number } = args;

  const { data: row, error } = await supabase
    .from("changesets")
    .select("id, number, type, status, created_at, changes(target_type, data)")
    .eq("space_id", spaceId)
    .eq("number", number)
    .maybeSingle();
  throwIfSupabaseError(error);

  // getByNumber와 같은 NOT_FOUND 관례 — 이미 판정됐거나(closed), relation이 아니거나,
  // (아래에서) conflicts/duplicates가 아닌 제안(확신 관계)이면 전부 "아직 판정 대기인
  // conflicts/duplicates가 아니다"로 뭉뚱그린다.
  if (!row || row.type !== "relation" || row.status !== "open") {
    throw new SupabaseError(
      "not_found",
      `pending relation changeset #${number} not found in space ${spaceId}`,
    );
  }
  if (row.number === null) {
    throw new Error(
      `changeset ${row.id} has no number despite being scoped to space ${spaceId}`,
    );
  }

  const relationChange = row.changes.find((c) => c.target_type === "relation");
  const proposal = parseRelationProposal(relationChange?.data);
  // relation 행이 하나도 없거나 파싱 실패하는 건(resolveBody의 같은 분기 주석
  // 참고) status='open' relation이면 정상 경로에선 절대 안 생기는 불변식
  // 위반(진짜 버그)이다 — duplicates/확신 관계처럼 "정상적으로 이 쿼리의
  // 대상이 아님"과는 다른 사실이라 뭉개지 않고 던진다.
  if (!proposal) {
    throw new SupabaseError(
      "query_failed",
      `pending relation changeset ${row.id} has no parseable relation change row`,
    );
  }
  if (proposal.type !== "conflicts" && proposal.type !== "duplicates") {
    throw new SupabaseError(
      "not_found",
      `pending relation changeset #${number} not found in space ${spaceId}`,
    );
  }
  // merge_draft 키 자체가 없는 것(정상, 초안 생성 실패 등)과 달리 키는 있는데
  // DigestDraftSchema 검증에 실패한 건 쓰기 쪽(worker.ts attachMergeDrafts)과 스키마가
  // 드리프트했다는 뜻이라 conventions.md의 "예상 밖 에러는 report" 원칙대로 보고한다 —
  // mergeDraft는 이미 null로 대체돼 있어 화면은 그대로 정상 동작한다(격리 원칙).
  if (proposal.type === "duplicates" && proposal.mergeDraftInvalid) {
    Sentry.captureException(
      new Error(
        `pending relation changeset ${row.id} has an invalid merge_draft shape`,
      ),
      {
        tags: { component: "changeset-detail-service", step: "merge-draft" },
        extra: { changesetId: row.id },
      },
    );
  }

  const [from, to] = await Promise.all([
    fetchRelationEndpoint({ supabase, statementId: proposal.fromId }),
    fetchRelationEndpoint({ supabase, statementId: proposal.toId }),
  ]);

  const body: PendingRelationBody =
    proposal.type === "conflicts"
      ? { kind: "conflict_pending", from, to }
      : {
          kind: "duplicate_pending",
          keeper: from,
          duplicate: to,
          mergeDraft: proposal.mergeDraft,
        };

  return {
    changesetId: row.id,
    changesetNumber: row.number,
    createdAt: row.created_at,
    body,
  };
}

import { type DigestBody, DigestBodySchema } from "@nema-io/shared";

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
  topics: { id: string; name: string }[];
  tags: { id: string; title: string; description: string }[];
  referenceIds: string[];
  externalUrls: string[];
  authorId: string | null;
  status: DigestStatus;
  createdAt: string;
}

interface RelationEndpointSnapshot {
  statementId: string;
  statementContent: string;
  statementStatus: StatementStatus;
  digest: DigestSnapshot;
}

// 이번 라운드가 채운 7케이스(ingestion 2 + relation 4 + revert 스텁) 밖은 전부
// "unsupported"로 묶는다 — manual(changeset 목록에 애초에 안 뜸), 확신 관계 자동 적용
// (supports/replaces/resolves 타입, 승자·패자 판정 UI 자체가 아직 백엔드에 없음),
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
  | { kind: "revert" }
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
      "id, title, description, body, external_urls, author_id, status, created_at, digest_topics(topic:topics(id, name)), digest_tags(tag:tags(id, title, description)), digest_references(reference_id)",
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
          name: dt.topic.name,
        })),
        tags: row.digest_tags.map((dt) => ({
          id: dt.tag.id,
          title: dt.tag.title,
          description: dt.tag.description,
        })),
        referenceIds: row.digest_references.map((dr) => dr.reference_id),
        externalUrls: row.external_urls ?? [],
        authorId: row.author_id,
        status: row.status,
        createdAt: row.created_at,
      },
    ]),
  );
}

// relation(충돌·중복) 카드는 진술이 아니라 그 진술이 속한 Digest를 통째로 보여준다
// (관계 판정 화면의 .rj-digest-card 재사용 전제, surface-inventory.md "Changeset 상세"
// 참고) — 그 안에서 이 진술이 어느 문장인지는 statementId/statementContent로 짚는다.
async function fetchRelationEndpoint(args: {
  supabase: TypedSupabaseClient;
  statementId: string;
}): Promise<RelationEndpointSnapshot> {
  const { supabase, statementId } = args;

  const { data: statement, error } = await supabase
    .from("statements")
    .select("id, content, status, digest_id")
    .eq("id", statementId)
    .single();
  throwIfSupabaseError(error);

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
    digest,
  };
}

async function resolveBody(args: {
  supabase: TypedSupabaseClient;
  type: ChangesetType;
  outcome: ChangesetOutcome | null;
  changes: ChangeRow[];
}): Promise<ChangesetDetailBody> {
  const { supabase, type, outcome, changes } = args;

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
    // relation 행 자체가 없거나 파싱이 실패하는 건 "아직 안 다루는 타입"과 달리
    // 불변식 위반(진짜 버그)이라 unsupported로 뭉개지 않고 던진다.
    const relationChange = changes.find((c) => c.target_type === "relation");
    if (!relationChange) {
      throw new SupabaseError(
        "query_failed",
        "relation changeset has no relation change row",
      );
    }
    const proposal = parseRelationProposal(relationChange.data);
    if (!proposal) {
      throw new SupabaseError(
        "query_failed",
        "relation change data does not match the expected proposal shape",
      );
    }

    if (proposal.type === "conflicts") {
      if (outcome === "discarded") {
        return { kind: "relation_conflict_discarded" };
      }
      if (outcome === "applied") {
        const [from, to] = await Promise.all([
          fetchRelationEndpoint({ supabase, statementId: proposal.fromId }),
          fetchRelationEndpoint({ supabase, statementId: proposal.toId }),
        ]);
        return { kind: "relation_conflict_applied", from, to };
      }
      return { kind: "unsupported" };
    }

    if (proposal.type === "duplicates") {
      if (outcome === "discarded") {
        return { kind: "relation_duplicate_discarded" };
      }
      if (outcome === "applied") {
        // 방향 규약(resolve_duplicate_relation 주석): from=keeper(남는 쪽), to=duplicate(가려진 쪽).
        const [keeper, duplicate] = await Promise.all([
          fetchRelationEndpoint({ supabase, statementId: proposal.fromId }),
          fetchRelationEndpoint({ supabase, statementId: proposal.toId }),
        ]);
        return { kind: "relation_duplicate_applied", keeper, duplicate };
      }
      return { kind: "unsupported" };
    }

    // supports/replaces/resolves — 확신 관계 자동 적용. 승자·패자를 사람이 판정하는
    // 화면 자체가 아직 없어(관계 판정 화면 미구현) 이번 라운드 스코프 밖.
    return { kind: "unsupported" };
  }

  if (type === "revert") {
    return { kind: "revert" };
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
      "id, number, type, status, outcome, title, source_id, reverts_id, revert_depth, invalidated_by_id, author_id, created_at, updated_at, changes(action, target_type, target_id, data)",
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

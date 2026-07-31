import * as Sentry from "@sentry/node";

import {
  type DigestBody,
  DigestBodySchema,
  type DigestDraft,
  type ReferenceType,
  type RelationType,
  type TagColor,
} from "@nema-io/shared";

import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  SupabaseError,
  throwIfSupabaseError,
} from "@server/infra/supabase-error";
import {
  classifyReopenShape,
  parseRelationProposal,
} from "@server/services/changeset-service";
import {
  StoredReferenceDataSchema,
  StoredReferenceMergeDataSchema,
} from "@server/services/digest-review-service";

type ChangesetType = Database["public"]["Enums"]["changeset_type"];
type ChangesetStatus = Database["public"]["Enums"]["changeset_status"];
type ChangesetOutcome = Database["public"]["Enums"]["changeset_outcome"];
type DigestStatus = Database["public"]["Enums"]["digest_status"];

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
  // 이 진술이 "지금 archived인지"(라이브 상태)가 아니라 "이 changeset이 실제로
  // archive했는지"를 담는다 — fetchRelationEndpoint 주석 참고. 다른 changeset이
  // 나중에 archive해도 여긴 false로 남아야 원인 오귀속(잘못된 배지)이 안 생긴다.
  archivedByChangeset: boolean;
  // fetchRelationEndpoint 주석 참고 — 이 진술이 Digest의 어느 칸에서 나왔는지 짚는 값.
  sourceField: string | null;
  sourceFieldIndex: number | null;
  digest: DigestSnapshot;
}

interface ReferenceSnapshot {
  id: string;
  type: ReferenceType;
  title: string;
  // 신규는 생성 시점 스냅샷(create-Change.data), 병합은 병합 결과 스냅샷
  // (modify-Change.data.after.body) — 둘 다 DigestSnapshot과 같은 "얼려진 기록"
  // 원칙이다. title/type은 이 changeset이 정한 값이 아니라(병합은 body만 바꿈)
  // fetchIngestionReferenceSnapshots가 references 테이블에서 최신값으로 채운다.
  body: string;
  externalUrls: string[];
}

// 이번 라운드가 채운 9케이스(ingestion 2 + relation 6 + revert 1) 밖은 전부
// "unsupported"로 묶는다 — manual(changeset 목록에 애초에 안 뜸),
// open(이 화면은 closed 전용, open은 별도 리뷰 화면이 담당) 등.
type ChangesetDetailBody =
  | {
      kind: "ingestion_applied";
      digests: DigestSnapshot[];
      newReferences: ReferenceSnapshot[];
      mergedReferences: ReferenceSnapshot[];
    }
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
  | {
      kind: "revert";
      revertsNumber: number;
      // status='open'인 재판정 초안일 때만 의미 있다 — changesetDetailRegistry가
      // 이 값으로 IngestionScreen/RelationJudgmentScreen 중 어느 화면을 열지
      // 정한다(classifyReopenShape와 같은 판정). 즉시 closed+applied로 끝나는
      // flip형 되돌리기(manual·확신 관계 대상)는 재판정 화면 자체가 없어 null.
      reopenShape: "ingestion" | "relation_judgment" | null;
    }
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
  // 있다. "AI(엔진)가 닫았는가"는 closedById가 아니라 closedByName의 NULL 여부로
  // 판단해야 한다 — closedById는 FK라 계정 삭제 시 SET NULL로 지워지지만
  // closedByName은 텍스트 스냅샷이라 그대로 남기 때문에, 사람이 닫은 뒤 계정이
  // 삭제되면 closedById만 NULL이 되고 closedByName은 남는다(author_id/author_name과
  // 같은 비대칭).
  closedById: string | null;
  closedByName: string | null;
  sourceId: string | null;
  revertsId: string | null;
  revertsNumber: number | null;
  invalidatedById: string | null;
  // 되돌림 여부 — is_changeset_reverted(SQL) 그대로. status='closed'·outcome='applied'인
  // changeset이 "지금 그래프에 살아있는 걸 만든 행"인지 판정하는 값(정책 결정 #26
  // 규칙 4, 브레인 product-decisions/cross-cutting) — true면 되돌리기 버튼 대신
  // "#nn에서 되돌림" 추적 링크(revertedByNumber)를
  // 보여준다.
  reverted: boolean;
  // reverted가 true일 때, 그 원인이 된 direct revert changeset의 number. 재판정이
  // 열려있든 확정됐든 항상 값이 있다 — "지금 그래프에 살아있는 걸 만든 게 아니다"라는
  // 사실 자체는 영구적이라, 추적 링크도 상태 무관하게 계속 남아있어야 한다(재판정
  // 상태는 그 링크를 눌러 들어가면 바로 보인다). 같은 원본을 여러 번 되돌린 토글
  // 체인(revert의 revert)이면 가장 최근 것 하나만 가리킨다.
  revertedByNumber: number | null;
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

// ingestion_applied 스냅샷의 Reference 카드 — 이 changeset이 만든(create) 신규
// Reference와 병합한(modify) 기존 Reference를 나눠 돌려준다(ReferenceSection과
// 같은 신규/병합 구분). 신규는 create-Change.data 그대로가 얼려진 전체 스냅샷이라
// 테이블 조회가 필요 없지만, 병합은 modify-Change.data에 after.body만 있어(title/type은
// 이 changeset이 안 건드림) references 테이블에서 최신 title/type을 마저 채운다.
async function fetchIngestionReferenceSnapshots(args: {
  supabase: TypedSupabaseClient;
  changes: ChangeRow[];
}): Promise<{
  newReferences: ReferenceSnapshot[];
  mergedReferences: ReferenceSnapshot[];
}> {
  const { supabase, changes } = args;

  const newReferences: ReferenceSnapshot[] = changes
    .filter((c) => c.target_type === "reference" && c.action === "create")
    .map((c) => {
      const referenceData = StoredReferenceDataSchema.parse(c.data);
      return {
        id: c.target_id,
        type: referenceData.type,
        title: referenceData.title,
        body: referenceData.body,
        externalUrls: referenceData.external_urls,
      };
    });

  const mergeChanges = changes.filter(
    (c) => c.target_type === "reference" && c.action === "modify",
  );
  if (mergeChanges.length === 0) {
    return { newReferences, mergedReferences: [] };
  }

  const { data: rows, error } = await supabase
    .from("references")
    .select("id, type, title, external_urls")
    .in(
      "id",
      mergeChanges.map((c) => c.target_id),
    );
  throwIfSupabaseError(error);

  // fetchDigestSnapshots와 같은 방향(요청 id 기준으로 순회) — rows를 그대로 map하면
  // .in()이 하드 삭제 등으로 일부 id를 못 찾았을 때 그 병합 Reference가 에러 없이
  // 조용히 목록에서 빠진다. mergeChanges 기준으로 순회해야 빠진 행이 여기서 잡히고,
  // 반환 순서도 changes의 원래 순서를 따라 결정적이 된다(rows는 Postgres 스캔
  // 순서라 비결정적).
  const referenceById = new Map((rows ?? []).map((row) => [row.id, row]));
  const mergedReferences: ReferenceSnapshot[] = mergeChanges.map((c) => {
    const reference = referenceById.get(c.target_id);
    if (!reference) {
      throw new SupabaseError(
        "query_failed",
        `reference ${c.target_id} merged by this changeset not found`,
      );
    }
    return {
      id: reference.id,
      type: reference.type,
      title: reference.title,
      body: StoredReferenceMergeDataSchema.parse(c.data).after.body,
      externalUrls: reference.external_urls ?? [],
    };
  });

  return { newReferences, mergedReferences };
}

// relation(충돌·중복) 카드는 진술이 아니라 그 진술이 속한 Digest를 통째로 보여준다
// (관계 판정 화면의 .rj-digest-card 재사용 전제, surface-inventory.md "Changeset 상세"
// 참고) — 그 안에서 이 진술이 어느 문장인지는 sourceField로 칸을 바로 짚고, sourceField가
// 없으면(이 마이그레이션 이전에 추출된 진술 등) statementId/statementContent로 대신 짚는다.
async function fetchRelationEndpoint(args: {
  supabase: TypedSupabaseClient;
  statementId: string;
  // 지금 보고 있는 changeset이 실제로 archive한 statement id 집합(resolveBody가
  // changes에서 한 번 뽑아 넘긴다) — 라이브 status 대신 이 집합 소속 여부로
  // archivedByChangeset을 판정해야, 이 진술이 나중에 다른 changeset이 archive해도
  // 여기서는 그 원인으로 잘못 표시되지 않는다.
  archivedStatementIds: Set<string>;
}): Promise<RelationEndpointSnapshot> {
  const { supabase, statementId, archivedStatementIds } = args;

  // maybeSingle — single()이 PGRST116(행 없음)을 not_found로 매핑해, source_purge로
  // 하드 삭제된 진술을 가리키는 change 행(참조 무결성 위반, 진짜 장애)이 "이 changeset을
  // 찾을 수 없음"으로 조용히 위장되고 Sentry도 스킵되는 문제가 있었다(EXPECTED_DOMAIN_CODES).
  // 아래 digest 조회와 같은 패턴으로 query_failed를 직접 던져 새지 않게 한다.
  const { data: statement, error } = await supabase
    .from("statements")
    .select("id, content, digest_id, source_field, source_field_index")
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
    archivedByChangeset: archivedStatementIds.has(statement.id),
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

  // 이 changeset이 실제로 archive한 statement id 집합 — fetchRelationEndpoint가
  // 라이브 status 대신 이걸로 archivedByChangeset을 판정한다(원인 오귀속 버그 수정).
  const archivedStatementIds = new Set(
    changes
      .filter((c) => c.action === "archive" && c.target_type === "statement")
      .map((c) => c.target_id),
  );

  if (type === "ingestion") {
    if (outcome === "discarded") {
      return { kind: "ingestion_discarded" };
    }
    if (outcome === "applied") {
      const digestIds = changes
        .filter((c) => c.target_type === "digest" && c.action === "create")
        .map((c) => c.target_id);
      const [snapshots, { newReferences, mergedReferences }] =
        await Promise.all([
          fetchDigestSnapshots({ supabase, digestIds }),
          fetchIngestionReferenceSnapshots({ supabase, changes }),
        ]);
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
      return {
        kind: "ingestion_applied",
        digests,
        newReferences,
        mergedReferences,
      };
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
            archivedStatementIds,
          }),
          fetchRelationEndpoint({
            supabase,
            statementId: pendingProposal.toId,
            archivedStatementIds,
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
            archivedStatementIds,
          }),
          fetchRelationEndpoint({
            supabase,
            statementId: pendingProposal.toId,
            archivedStatementIds,
          }),
        ]);
        return { kind: "relation_duplicate_applied", keeper, duplicate };
      }
      return { kind: "unsupported" };
    }

    // supports/replaces/resolves — 확신 관계. 이 슬라이스부터 낮은 확신도는
    // worker.ts의 gateProposals가 open 제안조차 만들지 않고 곧바로 버린다 — 그래서
    // 지금 새로 생기는 이 타입 changeset은 전부 confident applied뿐이다. 아래
    // discarded 분기는 그 이전(gateProposals가 conflicts/duplicates와 동일하게
    // 애매한 supports/replaces/resolves도 open pending으로 올리던 시절)에 만들어진
    // 레거시 행을 읽기 위해서만 남아 있다 — closed+discarded로 이미 닫힌 그 옛 행들이
    // 여전히 존재하므로 조회 시 여기서 처리한다.
    // 확신 적용은 apply_relation_changesets의 자동 루프가 배치당 changeset 1개에
    // 성공한 관계마다 change 행을 쌓으므로(사람 판정 1쌍=1changeset과 다름) 전부 모은다.
    if (outcome === "discarded") {
      return { kind: "relation_confident_discarded" };
    }
    if (outcome === "applied") {
      const relations = await Promise.all(
        proposals.map(async (proposal) => {
          const [from, to] = await Promise.all([
            fetchRelationEndpoint({
              supabase,
              statementId: proposal.fromId,
              archivedStatementIds,
            }),
            fetchRelationEndpoint({
              supabase,
              statementId: proposal.toId,
              archivedStatementIds,
            }),
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
    const reopenShape = classifyReopenShape(
      changes.map((c) => ({
        targetType: c.target_type,
        action: c.action,
        data: c.data,
      })),
    );
    return { kind: "revert", revertsNumber, reopenShape };
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
      "id, number, type, status, outcome, title, source_id, reverts_id, invalidated_by_id, author_id, author_name, closed_by_id, closed_by_name, created_at, updated_at, changes(action, target_type, target_id, data)",
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

  // 되돌리기 버튼 노출은 status='closed' AND outcome='applied'일 때만 의미가
  // 있다(ChangesetRecordScreen) — 나머지 상태는 조회 자체를 생략해 매 상세 조회마다
  // RPC·쿼리를 추가로 태우지 않는다(정책 결정 #26 규칙 4, 브레인 product-decisions/cross-cutting).
  let reverted = false;
  let revertedByNumber: number | null = null;
  if (row.status === "closed" && row.outcome === "applied") {
    const { data: revertedResult, error: revertedError } = await supabase.rpc(
      "is_changeset_reverted",
      { p_changeset_id: row.id },
    );
    throwIfSupabaseError(revertedError);
    reverted = revertedResult ?? false;

    if (reverted) {
      const { data: revertChildren, error: revertChildError } = await supabase
        .from("changesets")
        .select("number")
        .eq("reverts_id", row.id)
        .order("created_at", { ascending: false })
        .limit(1);
      throwIfSupabaseError(revertChildError);
      revertedByNumber = revertChildren?.[0]?.number ?? null;
    }
  }

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
    invalidatedById: row.invalidated_by_id,
    reverted,
    revertedByNumber,
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

  // getByNumber와 같은 NOT_FOUND 관례 — 이미 판정됐거나(closed), relation/revert가
  // 아니거나, (아래에서) conflicts/duplicates가 아닌 제안(확신 관계)이면 전부
  // "아직 판정 대기인 conflicts/duplicates가 아니다"로 뭉뚱그린다. type='revert'도
  // 대상이다 — ingestion/relation(충돌·중복) 되돌리기가 여는 재판정 초안은
  // type='revert'인 채로 이 화면(관계 판정 화면)을 그대로 쓴다.
  if (
    !row ||
    (row.type !== "relation" && row.type !== "revert") ||
    row.status !== "open"
  ) {
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

  // type='revert'인 재판정 초안은 원본 되돌리기가 남긴 archive/restore relation
  // change(data 없음)와 복제된 원래 제안(conflicts/duplicates)이 함께 있을 수
  // 있다(resolveBody의 같은 주석 참고) — data->>'type'으로 원래 제안만 골라야지,
  // 행 순서(embed 순서 비보장)에 기대면 안 된다.
  const proposal = row.changes
    .filter((c) => c.target_type === "relation")
    .map((c) => parseRelationProposal(c.data))
    .find((p): p is NonNullable<typeof p> => p !== null);
  // relation 행이 하나도 없거나 파싱 실패하는 건 type='relation'이면(resolveBody의
  // 같은 분기 주석 참고) status='open'인 정상 경로에선 절대 안 생기는 불변식
  // 위반(진짜 버그)이라 뭉개지 않고 던진다. type='revert'는 다른 화면(Digest
  // 리뷰)용 재판정 초안일 수 있어(정상) 그냥 not_found로 넘긴다.
  if (!proposal) {
    if (row.type === "revert") {
      throw new SupabaseError(
        "not_found",
        `pending relation changeset #${number} not found in space ${spaceId}`,
      );
    }
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

  // 판정 대기(open) 화면은 archived 배지를 그리지 않아 이 changeset은 아직 아무것도
  // archive하지 않았다 — 빈 집합으로 충분하다(1b 버그는 closed 스냅샷 전용).
  const noArchivedStatements = new Set<string>();
  const [from, to] = await Promise.all([
    fetchRelationEndpoint({
      supabase,
      statementId: proposal.fromId,
      archivedStatementIds: noArchivedStatements,
    }),
    fetchRelationEndpoint({
      supabase,
      statementId: proposal.toId,
      archivedStatementIds: noArchivedStatements,
    }),
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

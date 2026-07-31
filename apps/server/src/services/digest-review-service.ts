import { z } from "zod";

import type {
  DigestDraft,
  NewReferenceDraft,
  ReferenceMergeUpdate,
  ReviewDigestDraft,
  ReviewLabelPalette,
  ReviewNewReferenceDraft,
  ReviewTagDraft,
  ReviewTopicDraft,
  TagColor,
} from "@nema-io/shared";
import {
  DigestBodySchema,
  ReferenceTypeSchema,
  TagColorSchema,
} from "@nema-io/shared";

import type { Json } from "@server/infra/database.types";
import { wakeStatementSync } from "@server/infra/statement-sync";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  SupabaseError,
  throwIfSupabaseError,
} from "@server/infra/supabase-error";

// --- 리뷰 상세 — Digest 리뷰 화면의 초안 상태 ---

// ingestion changeset의 digest create-Change 저장 형태 — write_ingestion_review_changes
// (엔진 최초 적재)와 update_pending_ingestion(사용자 저장) 둘 다 이 형태로 쓴다. 형태가
// 어긋나면 마이그레이션과 서비스가 갈라진 것이므로 조용히 넘기지 않고 검증 실패로 드러낸다.
const StoredIngestionDigestDataSchema = z.object({
  title: z.string(),
  description: z.string(),
  body: DigestBodySchema,
  // 리뷰 레벨 라벨 팔레트(changesets.label_draft) 항목을 가리키는 id 배열 —
  // reference_ids의 신규 부분(newReferenceKeys)이 changeset의 신규 Reference를
  // id로 가리키는 것과 같은 결이다(#28).
  topics: z.array(z.string().uuid()),
  tags: z.array(z.string().uuid()),
  reference_ids: z.array(z.string().uuid()),
  external_urls: z.array(z.string()),
});

// changesets.label_draft 저장 형태 — 항목의 id는 이 초안 안에서의 정체성일 뿐
// 레지스트리 행과 무관하다(registryId는 아래에서 이름으로 찾아 얹는다).
const StoredLabelDraftSchema = z.object({
  topics: z.array(z.object({ id: z.string().uuid(), title: z.string() })),
  tags: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
      color: TagColorSchema,
    }),
  ),
});

// changeset-detail-service.ts(ingestion_applied 스냅샷)와 공유하는 changes.data
// 파싱 계약 — 두 서비스 다 같은 change 행을 읽으므로 스키마가 갈라지면 안 된다.
export const StoredReferenceDataSchema = z.object({
  type: ReferenceTypeSchema,
  title: z.string(),
  body: z.string(),
  // 이 PR 이전에 생성된 reference create-Change엔 external_urls 키가 없다
  // (#355·#356 배포본이 만든 pending 리뷰) — 옛 Change를 무해하게 읽는다
  external_urls: z.array(z.string()).default([]),
});

// 기존 Reference 병합 modify-Change의 편집 대상은 after.body뿐(type/title 읽기 전용) —
// update_reference와 같은 {before, after} 형태에서 다듬을 값만 읽는다.
export const StoredReferenceMergeDataSchema = z.object({
  after: z.object({ body: z.string() }),
});

// changes.position은 digest/reference 외 target_type도 공유하는 컬럼이라 테이블
// 레벨에선 nullable이다 — 리뷰 후보(create) 행은 마이그레이션 백필 이후 항상 채워져
// 있어야 하므로, 비어 있으면 스키마·데이터가 갈라진 것으로 보고 조용히 넘기지 않는다.
function requirePosition(position: number | null, changeId: string): number {
  if (position === null) {
    throw new SupabaseError(
      "query_failed",
      `change ${changeId} is a review candidate but has no position`,
    );
  }
  return position;
}

// changes.data/changesets.label_draft(JSONB) 스냅샷은 스키마가 나중에 바뀌면(예:
// TagColor 값 목록 변경) 더 이상 파싱되지 않을 수 있다 — 원본 ZodError를 그대로
// 던지면 trpc.ts의 isZodInputError가 "입력 검증 실패"로 오인해 원인 추적이 막힌다.
// requirePosition과 같은 결로 query_failed로 명시한다.
function parseStoredData<T>(args: {
  schema: z.ZodType<T>;
  data: unknown;
  context: string;
}): T {
  const { schema, data, context } = args;
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SupabaseError(
      "query_failed",
      `${context}: ${result.error.message}`,
      result.error,
    );
  }
  return result.data;
}

interface CitedReference {
  id: string;
  type: string;
  title: string;
  // 현재(병합 전) 설명 — 화면이 원본을 읽기 전용으로 보여주고 "원래대로" 되돌릴 기준.
  body: string;
  // 엔진이 병합 제안을 낸 경우에만 편집 가능한 다듬음 본문 / 단순 인용이면 null(읽기 전용)
  mergeNote: string | null;
}

interface DigestReviewDetail {
  changesetId: string;
  changesetNumber: number;
  // Topic 검색(topic.list)을 이 Space로 좁히는 데 쓴다 — 다른 Space의 동명
  // Topic이 "기존"으로 잘못 노출되지 않도록.
  spaceId: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceBody: string;
  sourceCreatedAt: string;
  // 두 탭 동시 편집 가드 — update가 이 값을 expectedVersion으로 그대로 되돌려보낸다.
  draftVersion: number;
  digests: ReviewDigestDraft[];
  // 리뷰 레벨 Topic/Tag 공유 팔레트(#28) — 각 digest는 이 안의 항목을 id로만
  // 가리킨다.
  labelDraft: ReviewLabelPalette;
  newReferences: ReviewNewReferenceDraft[];
  // 기존 레퍼런스 인용의 표시용 메타(id → 이름·유형)
  citedReferences: CitedReference[];
}

export async function getReview(args: {
  supabase: TypedSupabaseClient;
  spaceId: string;
  number: number;
}): Promise<DigestReviewDetail> {
  const { supabase, spaceId, number } = args;

  const { data: changeset, error } = await supabase
    .from("changesets")
    .select(
      "id, number, type, status, source_id, space_id, draft_version, label_draft, changes(id, action, target_type, target_id, data, position), sources(title, body, created_at), spaces(workspace_id)",
    )
    .eq("space_id", spaceId)
    .eq("number", number)
    // 명시적 position(update_pending_ingestion이 저장 때마다 그대로 보존)으로 정렬한다.
    // id는 동순위일 때만 쓰는 결정적 tiebreak.
    .order("position", { referencedTable: "changes" })
    .order("id", { referencedTable: "changes" })
    .single();
  throwIfSupabaseError(error);

  if (
    (changeset.type !== "ingestion" && changeset.type !== "revert") ||
    changeset.status !== "open" ||
    changeset.source_id === null ||
    changeset.sources === null ||
    changeset.number === null ||
    changeset.space_id === null ||
    changeset.spaces === null ||
    changeset.draft_version === null ||
    // type='revert'는 relation(충돌·중복) 되돌리기가 여는 재판정 초안일 수도
    // 있다(source_id 없음) — 이 화면은 ingestion-shaped 초안 전용이라 digest
    // create-Change가 하나도 없으면 대상이 아니다.
    !changeset.changes.some(
      (change) => change.target_type === "digest" && change.action === "create",
    )
  ) {
    // 존재하지 않는 changeset(위 .single()이 이미 잡음)과 달리 이건 "있긴 한데
    // 지금 이 화면 자격이 아니다"(이미 닫힘·타입이 다름 등) — 그래도 FE 입장에선
    // "이 리뷰에 지금 접근할 수 없다"는 같은 결과라 not_found로 통일한다. 원문
    // 메시지가 그대로 클라이언트에 새지 않도록 SupabaseError로 던진다(session-service.ts 패턴).
    throw new SupabaseError(
      "not_found",
      `changeset #${number} in space ${spaceId} is not an open ingestion review`,
    );
  }

  const referenceChanges = changeset.changes.filter(
    (change) =>
      change.target_type === "reference" && change.action === "create",
  );
  const newReferenceIds = new Set(
    referenceChanges.map((change) => change.target_id),
  );

  const newReferences: ReviewNewReferenceDraft[] = referenceChanges.map(
    (change) => {
      const referenceData = parseStoredData({
        schema: StoredReferenceDataSchema,
        data: change.data,
        context: `reference change ${change.id} has invalid stored data`,
      });
      return {
        id: change.target_id,
        position: requirePosition(change.position, change.id),
        type: referenceData.type,
        title: referenceData.title,
        body: referenceData.body,
        externalUrls: referenceData.external_urls,
      };
    },
  );

  const digestChanges = changeset.changes.filter(
    (change) => change.target_type === "digest" && change.action === "create",
  );
  const rawDigests = digestChanges.map((change) => ({
    id: change.target_id,
    position: requirePosition(change.position, change.id),
    ...parseStoredData({
      schema: StoredIngestionDigestDataSchema,
      data: change.data,
      context: `digest change ${change.id} has invalid stored data`,
    }),
  }));

  const labelDraftRaw = parseStoredData({
    schema: StoredLabelDraftSchema,
    data: changeset.label_draft ?? { topics: [], tags: [] },
    context: `changeset ${changeset.id} has invalid label_draft`,
  });

  // 기존/신규 판정 — 이름이 Space(topics)·Workspace(tags) 레지스트리와 매치하면 기존
  // (registryId 포함, 읽기 전용), 매치 없으면 신규(registryId null). archived 항목은
  // 재사용 후보에서 제외한다(update_topic 마이그레이션 주석과 같은 결 — restore 없이
  // 조용히 재사용되면 안 된다). #28부터 팔레트가 리뷰 레벨 하나뿐이라 이 판정도
  // digest마다가 아니라 팔레트 전체에 한 번만 한다.
  const topicNames = [...new Set(labelDraftRaw.topics.map((t) => t.title))];
  const tagTitles = [...new Set(labelDraftRaw.tags.map((t) => t.title))];

  const topicIdByTitle = new Map<string, string>();
  if (topicNames.length > 0) {
    const { data: topicRows, error: topicError } = await supabase
      .from("topics")
      .select("id, title")
      .eq("space_id", changeset.space_id)
      .eq("status", "active")
      .in("title", topicNames);
    throwIfSupabaseError(topicError);
    for (const row of topicRows ?? []) {
      topicIdByTitle.set(row.title, row.id);
    }
  }

  const tagRegistryByTitle = new Map<string, { id: string; color: TagColor }>();
  if (tagTitles.length > 0) {
    const { data: tagRows, error: tagError } = await supabase
      .from("tags")
      .select("id, title, color")
      .eq("workspace_id", changeset.spaces.workspace_id)
      .eq("status", "active")
      .in("title", tagTitles);
    throwIfSupabaseError(tagError);
    for (const row of tagRows ?? []) {
      tagRegistryByTitle.set(row.title, { id: row.id, color: row.color });
    }
  }

  const resolvedTopics: ReviewTopicDraft[] = labelDraftRaw.topics.map(
    (topic) => ({
      id: topic.id,
      registryId: topicIdByTitle.get(topic.title) ?? null,
      title: topic.title,
    }),
  );
  const resolvedTags: ReviewTagDraft[] = labelDraftRaw.tags.map((tag) => {
    const registryTag = tagRegistryByTitle.get(tag.title);
    return {
      id: tag.id,
      registryId: registryTag?.id ?? null,
      title: tag.title,
      description: tag.description,
      // 기존 태그를 엔진이 재제안하면 draft 색은 write_ingestion_review_changes가
      // 뽑은 랜덤값일 뿐이다 — confirm_ingestion_review는 기존 태그의 색을 안
      // 덮으므로, 리뷰 화면도 draft 색이 아니라 레지스트리의 실제 색을 보여줘야
      // 리뷰에서 본 색과 확정 후 저장된 색이 어긋나지 않는다.
      color: registryTag?.color ?? tag.color,
    };
  });
  const labelDraft: ReviewLabelPalette = {
    topics: resolvedTopics,
    tags: resolvedTags,
  };

  const digests: ReviewDigestDraft[] = rawDigests.map((digestData) => ({
    id: digestData.id,
    position: digestData.position,
    title: digestData.title,
    description: digestData.description,
    body: digestData.body,
    topics: digestData.topics,
    tags: digestData.tags,
    referenceIds: digestData.reference_ids.filter(
      (id) => !newReferenceIds.has(id),
    ),
    newReferenceKeys: digestData.reference_ids.filter((id) =>
      newReferenceIds.has(id),
    ),
    externalUrls: digestData.external_urls,
  }));

  // 병합 제안(modify)의 다듬음 본문을 id로 얹는다 — 제안이 없는 인용은 mergeNote=null
  const mergeNoteById = new Map<string, string>();
  for (const change of changeset.changes) {
    if (change.target_type === "reference" && change.action === "modify") {
      const mergeData = parseStoredData({
        schema: StoredReferenceMergeDataSchema,
        data: change.data,
        context: `reference merge change ${change.id} has invalid stored data`,
      });
      mergeNoteById.set(change.target_id, mergeData.after.body);
    }
  }

  const citedIds = [
    ...new Set(digests.flatMap((digest) => digest.referenceIds)),
  ];
  let citedReferences: CitedReference[] = [];
  if (citedIds.length > 0) {
    // archived/trashed Reference를 인용 목록에 그대로 올리면, 그중 병합 제안(mergeNote)이
    // 있던 것은 이후 모든 저장이 update_pending_ingestion의 NM008 가드(활성 상태만
    // 병합 허용)에 영구히 막힌다 — 이 저장에서 그 Reference를 안 건드려도 toReferenceUpdates가
    // 살아있는 병합 후보 전량을 매번 다시 실어 보내기 때문. 애초에 편집 대상으로
    // 올리지 않아야 그 저장 불가 상태 자체가 생기지 않는다.
    const { data: references, error: referenceError } = await supabase
      .from("references")
      .select("id, type, title, body")
      .eq("status", "active")
      .in("id", citedIds);
    throwIfSupabaseError(referenceError);
    citedReferences = (references ?? []).map((reference) => ({
      ...reference,
      mergeNote: mergeNoteById.get(reference.id) ?? null,
    }));
  }

  return {
    changesetId: changeset.id,
    changesetNumber: changeset.number,
    spaceId: changeset.space_id,
    sourceId: changeset.source_id,
    sourceTitle: changeset.sources.title,
    sourceBody: changeset.sources.body,
    sourceCreatedAt: changeset.sources.created_at,
    draftVersion: changeset.draft_version,
    digests,
    labelDraft,
    newReferences,
    citedReferences,
  };
}

// --- 초안 편집·확정 ---

export async function updateReview(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
  expectedVersion: number;
  digests: ReviewDigestDraft[];
  labelDraft: ReviewLabelPalette;
  newReferences: ReviewNewReferenceDraft[];
  referenceUpdates: ReferenceMergeUpdate[];
}): Promise<{ draftVersion: number }> {
  const {
    supabase,
    changesetId,
    expectedVersion,
    digests,
    labelDraft,
    newReferences,
    referenceUpdates,
  } = args;

  const { data: draftVersion, error } = await supabase.rpc(
    "update_pending_ingestion",
    {
      p_changeset_id: changesetId,
      p_expected_version: expectedVersion,
      // RPC 계약 키는 update_pending_ingestion이 읽는 snake_case다. id·position은
      // 그대로 실어 보낸다(RPC가 id로 upsert·position으로 순서를 잡는다). topics/tags는
      // 팔레트 항목 id 배열 그대로 통과한다(#28) — registryId는 조회 때 이름으로
      // 계산한 파생값이라 저장 형태엔 없다.
      p_digests: digests.map((digest) => ({
        id: digest.id,
        position: digest.position,
        title: digest.title,
        description: digest.description,
        body: digest.body,
        topics: digest.topics,
        tags: digest.tags,
        reference_ids: digest.referenceIds,
        new_reference_keys: digest.newReferenceKeys,
        external_urls: digest.externalUrls,
      })) as unknown as Json,
      p_label_draft: {
        topics: labelDraft.topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
        })),
        tags: labelDraft.tags.map((tag) => ({
          id: tag.id,
          title: tag.title,
          description: tag.description,
          color: tag.color,
        })),
      } as unknown as Json,
      p_new_references: newReferences.map((reference) => ({
        id: reference.id,
        position: reference.position,
        type: reference.type,
        title: reference.title,
        body: reference.body,
        external_urls: reference.externalUrls,
      })) as unknown as Json,
      // 병합 편집 → RPC 계약 키(snake_case): mergeNote가 references.body를 대체할 body가 된다
      p_reference_updates: referenceUpdates.map((update) => ({
        reference_id: update.referenceId,
        body: update.mergeNote,
      })) as unknown as Json,
    },
  );
  throwIfSupabaseError(error);

  return { draftVersion };
}

export async function confirmReview(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
}): Promise<{ sourceId: string }> {
  const { supabase, changesetId } = args;

  const { data: sourceId, error } = await supabase.rpc(
    "confirm_ingestion_review",
    { p_changeset_id: changesetId },
  );
  throwIfSupabaseError(error);
  wakeStatementSync();

  return { sourceId };
}

// 버리기 — changes를 하나도 적용하지 않고 changeset을 닫는다(하드 삭제 아님).
export async function discardReview(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
}): Promise<void> {
  const { supabase, changesetId } = args;

  const { error } = await supabase.rpc("discard_ingestion_review", {
    p_changeset_id: changesetId,
  });
  throwIfSupabaseError(error);
}

// 되살리기 — 새 changeset을 안 만들고 같은 changeset을 in-place로 되돌린다.
export async function restoreReview(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
}): Promise<void> {
  const { supabase, changesetId } = args;

  const { error } = await supabase.rpc("restore_ingestion_review", {
    p_changeset_id: changesetId,
  });
  throwIfSupabaseError(error);
}

// --- 확정 Digest 직접 수정 ---

// 옛 Digest archive + 이 초안으로 새 Digest create를 한 manual changeset으로 확정한다.
// 리뷰 확정과 달리 pending 초안 persist가 없어 편집 상태는 클라가 들고, 여기선 확정만 받는다.
export async function confirmDigestEdit(args: {
  supabase: TypedSupabaseClient;
  digestId: string;
  digest: DigestDraft;
  newReferences: NewReferenceDraft[];
}): Promise<{ digestId: string }> {
  const { supabase, digestId, digest, newReferences } = args;

  const { data: newDigestId, error } = await supabase.rpc(
    "confirm_digest_edit",
    {
      p_digest_id: digestId,
      // RPC 계약 키는 confirm_digest_edit이 읽는 snake_case. 초안을 저장·재조회하는 단계가
      // 없어(확정 때 한 번만 온다) 항목 id도 없다 — 이름만 넘기고 registryId는 버린다.
      p_digest: {
        title: digest.title,
        description: digest.description,
        body: digest.body,
        topics: digest.topics.map((topic) => topic.title),
        tags: digest.tags.map((tag) => ({
          title: tag.title,
          description: tag.description,
        })),
        reference_ids: digest.referenceIds,
        new_reference_keys: digest.newReferenceKeys,
        external_urls: digest.externalUrls,
      } as unknown as Json,
      // updateReview와 같은 snake_case 계약 — external_urls까지 통과시킨다(#360)
      p_new_references: newReferences.map((reference) => ({
        key: reference.key,
        type: reference.type,
        title: reference.title,
        body: reference.body,
        external_urls: reference.externalUrls,
      })) as unknown as Json,
    },
  );
  throwIfSupabaseError(error);
  wakeStatementSync();

  return { digestId: newDigestId };
}

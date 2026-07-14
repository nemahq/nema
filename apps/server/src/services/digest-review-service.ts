import { z } from "zod";

import type { DigestDraft, NewReferenceDraft } from "@nema-io/shared";
import { DigestBodySchema, ReferenceTypeSchema } from "@nema-io/shared";

import type { Json } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// --- 리뷰 상세 — Digest 리뷰 화면의 초안 상태 ---

// changes.data는 우리 RPC(write_ingestion_review_changes)만 쓴다 — 형태가 어긋나면
// 마이그레이션과 서비스가 갈라진 것이므로 조용히 넘기지 않고 검증 실패로 드러낸다.
const StoredDigestDataSchema = z.object({
  title: z.string(),
  description: z.string(),
  body: DigestBodySchema,
  topics: z.array(z.string()),
  tags: z.array(z.object({ title: z.string(), description: z.string() })),
  reference_ids: z.array(z.string().uuid()),
  external_urls: z.array(z.string()),
});

const StoredReferenceDataSchema = z.object({
  type: ReferenceTypeSchema,
  title: z.string(),
  body: z.string(),
  // 이 PR 이전에 생성된 reference create-Change엔 external_urls 키가 없다
  // (#355·#356 배포본이 만든 pending 리뷰) — 옛 Change를 무해하게 읽는다
  external_urls: z.array(z.string()).default([]),
});

interface CitedReference {
  id: string;
  type: string;
  title: string;
}

interface DigestReviewDetail {
  changesetId: string;
  changesetNumber: number;
  sourceId: string;
  sourceTitle: string | null;
  sourceBody: string;
  sourceCreatedAt: string;
  digests: DigestDraft[];
  // key = 이 리뷰가 예약한 행 id — 편집 왕복에서만 쓰는 불투명 값
  newReferences: NewReferenceDraft[];
  // 기존 레퍼런스 인용의 표시용 메타(id → 이름·유형)
  citedReferences: CitedReference[];
}

export async function getReview(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
}): Promise<DigestReviewDetail> {
  const { supabase, changesetId } = args;

  const { data: changeset, error } = await supabase
    .from("changesets")
    .select(
      "id, number, type, status, source_id, space_id, changes(id, action, target_type, target_id, data), sources(title, body, created_at), spaces(workspace_id)",
    )
    .eq("id", changesetId)
    .single();
  throwIfSupabaseError(error);

  if (
    changeset.type !== "ingestion" ||
    changeset.status !== "pending" ||
    changeset.source_id === null ||
    changeset.sources === null ||
    changeset.number === null ||
    changeset.space_id === null ||
    changeset.spaces === null
  ) {
    throw new Error(
      `changeset ${changesetId} is not a pending ingestion review`,
    );
  }

  const referenceChanges = changeset.changes.filter(
    (change) =>
      change.target_type === "reference" && change.action === "create",
  );
  const newReferenceIds = new Set(
    referenceChanges.map((change) => change.target_id),
  );

  const newReferences: NewReferenceDraft[] = referenceChanges.map((change) => {
    const referenceData = StoredReferenceDataSchema.parse(change.data);
    return {
      // 저장 시 예약된 행 id를 편집 왕복의 key로 재사용한다 — update가 새 id를
      // 다시 예약하므로 값 자체는 불투명하면 충분하다
      key: change.target_id,
      type: referenceData.type,
      title: referenceData.title,
      body: referenceData.body,
      externalUrls: referenceData.external_urls,
    };
  });

  const rawDigests = changeset.changes
    .filter(
      (change) => change.target_type === "digest" && change.action === "create",
    )
    .map((change) => StoredDigestDataSchema.parse(change.data));

  // 기존/신규 판정 — 이름이 Space(topics)·Workspace(tags) 레지스트리와 매치하면 기존
  // (id 포함, 읽기 전용), 매치하지 않으면 신규(id 없음, 이름 편집 가능). archived 항목은
  // 재사용 후보에서 제외한다(update_topic 마이그레이션 주석과 같은 결 — restore 없이
  // 조용히 재사용되면 안 된다).
  const topicNames = [...new Set(rawDigests.flatMap((d) => d.topics))];
  const tagTitles = [
    ...new Set(rawDigests.flatMap((d) => d.tags.map((tag) => tag.title))),
  ];

  const topicIdByName = new Map<string, string>();
  if (topicNames.length > 0) {
    const { data: topicRows, error: topicError } = await supabase
      .from("topics")
      .select("id, name")
      .eq("space_id", changeset.space_id)
      .eq("status", "active")
      .in("name", topicNames);
    throwIfSupabaseError(topicError);
    for (const row of topicRows ?? []) {
      topicIdByName.set(row.name, row.id);
    }
  }

  const tagIdByTitle = new Map<string, string>();
  if (tagTitles.length > 0) {
    const { data: tagRows, error: tagError } = await supabase
      .from("tags")
      .select("id, title")
      .eq("workspace_id", changeset.spaces.workspace_id)
      .eq("status", "active")
      .in("title", tagTitles);
    throwIfSupabaseError(tagError);
    for (const row of tagRows ?? []) {
      tagIdByTitle.set(row.title, row.id);
    }
  }

  const digests: DigestDraft[] = rawDigests.map((digestData) => ({
    title: digestData.title,
    description: digestData.description,
    body: digestData.body,
    topics: digestData.topics.map((name) => ({
      id: topicIdByName.get(name) ?? null,
      name,
    })),
    tags: digestData.tags.map((tag) => ({
      id: tagIdByTitle.get(tag.title) ?? null,
      title: tag.title,
      description: tag.description,
    })),
    referenceIds: digestData.reference_ids.filter(
      (id) => !newReferenceIds.has(id),
    ),
    newReferenceKeys: digestData.reference_ids.filter((id) =>
      newReferenceIds.has(id),
    ),
    externalUrls: digestData.external_urls,
  }));

  const citedIds = [
    ...new Set(digests.flatMap((digest) => digest.referenceIds)),
  ];
  let citedReferences: CitedReference[] = [];
  if (citedIds.length > 0) {
    const { data: references, error: referenceError } = await supabase
      .from("references")
      .select("id, type, title")
      .in("id", citedIds);
    throwIfSupabaseError(referenceError);
    citedReferences = references ?? [];
  }

  return {
    changesetId: changeset.id,
    changesetNumber: changeset.number,
    sourceId: changeset.source_id,
    sourceTitle: changeset.sources.title,
    sourceBody: changeset.sources.body,
    sourceCreatedAt: changeset.sources.created_at,
    digests,
    newReferences,
    citedReferences,
  };
}

// --- 초안 편집·확정 ---

export async function updateReview(args: {
  supabase: TypedSupabaseClient;
  changesetId: string;
  digests: DigestDraft[];
  newReferences: NewReferenceDraft[];
}): Promise<void> {
  const { supabase, changesetId, digests, newReferences } = args;

  const { error } = await supabase.rpc("update_pending_ingestion", {
    p_changeset_id: changesetId,
    // RPC 계약 키는 write_ingestion_review_changes가 읽는 snake_case다.
    // topics/tags의 id는 getReview가 붙인 표시용 힌트라 저장 형태(name/{title,description})엔
    // 없다 — confirm 시 이름으로 다시 find-or-create되므로 id 없이도 기존 항목이 재사용된다.
    p_digests: digests.map((digest) => ({
      title: digest.title,
      description: digest.description,
      body: digest.body,
      topics: digest.topics.map((topic) => topic.name),
      tags: digest.tags.map((tag) => ({
        title: tag.title,
        description: tag.description,
      })),
      reference_ids: digest.referenceIds,
      new_reference_keys: digest.newReferenceKeys,
      external_urls: digest.externalUrls,
    })) as unknown as Json,
    p_new_references: newReferences.map((reference) => ({
      key: reference.key,
      type: reference.type,
      title: reference.title,
      body: reference.body,
      external_urls: reference.externalUrls,
    })) as unknown as Json,
  });
  throwIfSupabaseError(error);
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
      // RPC 계약 키는 confirm_digest_edit이 읽는 snake_case (update_pending_ingestion과 동일,
      // topics/tags의 id를 저장 형태에서 벗겨내는 것도 동일)
      p_digest: {
        title: digest.title,
        description: digest.description,
        body: digest.body,
        topics: digest.topics.map((topic) => topic.name),
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

  return { digestId: newDigestId };
}

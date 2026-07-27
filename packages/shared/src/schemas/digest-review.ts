import { z } from "zod";

import {
  DIGEST_DESCRIPTION_MAX_LENGTH,
  DIGEST_TITLE_MAX_LENGTH,
  DigestBodySchema,
} from "./digest";
import {
  REFERENCE_BODY_MAX_LENGTH,
  REFERENCE_EXTERNAL_URLS_MAX,
  REFERENCE_TITLE_MAX_LENGTH,
  ReferenceTypeSchema,
} from "./reference";
import { TagDraftSchema } from "./tag";
import { TOPIC_TITLE_MAX_LENGTH } from "./topic";

// 멀티 라벨 보수적 상한 — 평소 1개, 명확히 다주제일 때만 여러 개. 군집화 방지.
export const DIGEST_TOPICS_MAX = 5;
export const DIGEST_TAGS_MAX = 5;
// 한 뭉치 안에 판단 유형이 섞이면 유형별로 쪼개진다(07-modeling Digest) —
// 정상 범위는 한 자릿수, 상한은 폭주 브레이크.
export const REVIEW_DIGESTS_MAX = 20;
export const REVIEW_NEW_REFERENCES_MAX = 20;
// 한 리뷰에서 병합 편집되는 기존 Reference 수 — 인용된 기존 Reference의 부분집합이라
// 신규 상한과 같은 결의 폭주 브레이크.
export const REVIEW_REFERENCE_UPDATES_MAX = 20;
export const DIGEST_EXTERNAL_URLS_MAX = 20;
// 신규 레퍼런스 참조 키 — LLM 제안·리뷰 편집이 행 생성 전에 서로를 가리키는 로컬 식별자.
// 편집 왕복은 예약 행 uuid(36자)를 key로 재사용하므로 상한이 이를 덮어야 한다.
const NEW_REFERENCE_KEY_MAX_LENGTH = 64;

export const NewReferenceDraftSchema = z.object({
  key: z.string().trim().min(1).max(NEW_REFERENCE_KEY_MAX_LENGTH),
  type: ReferenceTypeSchema,
  title: z.string().trim().min(1).max(REFERENCE_TITLE_MAX_LENGTH),
  body: z.string().trim().min(1).max(REFERENCE_BODY_MAX_LENGTH),
  externalUrls: z.array(z.string().url()).max(REFERENCE_EXTERNAL_URLS_MAX),
});
export type NewReferenceDraft = z.infer<typeof NewReferenceDraftSchema>;

// Digest 리뷰 화면 전용 — 신규 Reference 후보 한 항목. NewReferenceDraftSchema(1회성
// confirm_digest_edit 전용)와 달리 이 화면은 초안을 여러 번 저장·재조회하므로 id가
// 저장을 거쳐도 유지돼야 한다(위 key와 달리 표시용 힌트가 아니라 실제 target_id
// 왕복 값 — update_pending_ingestion이 id 기준 upsert로 이 값을 그대로 보존한다).
// position은 명시적 순서(update_pending_ingestion이 DELETE+INSERT로 순서를 흩던
// 문제의 해결책) — 클라가 배열 인덱스를 그대로 실어 보낸다.
export const ReviewNewReferenceDraftSchema = z.object({
  id: z.string().uuid(),
  type: ReferenceTypeSchema,
  title: z.string().trim().min(1).max(REFERENCE_TITLE_MAX_LENGTH),
  body: z.string().trim().min(1).max(REFERENCE_BODY_MAX_LENGTH),
  externalUrls: z.array(z.string().url()).max(REFERENCE_EXTERNAL_URLS_MAX),
  position: z.number().int().min(0),
});
export type ReviewNewReferenceDraft = z.infer<
  typeof ReviewNewReferenceDraftSchema
>;

// 기존 Reference 병합 편집 — 매칭된 기존 Reference(id, 읽기 전용 type/title)의 설명을
// 새 정보를 녹인 완성본으로 다듬는다. mergeNote는 references.body를 통째로 대체하는
// 값이라 신규 body와 같은 상한을 쓴다(review-flow.md "기존 Reference 후보 병합 편집").
export const ReferenceMergeUpdateSchema = z.object({
  referenceId: z.string().uuid(),
  mergeNote: z.string().trim().min(1).max(REFERENCE_BODY_MAX_LENGTH),
});
export type ReferenceMergeUpdate = z.infer<typeof ReferenceMergeUpdateSchema>;

// 리뷰 draft의 Topic/Tag 한 항목 — 레지스트리(topics/tags) 이름 매칭 결과를 얹는다.
// id가 있으면 기존 항목(재사용, 이름 읽기 전용) / null이면 신규 항목(이름 편집 가능) —
// review-flow.md "기존 Topic·Tag는 이름 수정 불가"/"신규 Topic·Tag 이름 수정 가능".
// 이 id는 표시·판정 전용 힌트일 뿐 쓰기 계약엔 없다 — 저장 시 이름만 남고, id는
// TagUpdateInputSchema의 id(신뢰되는 PK, 그 레코드를 직접 수정)와 달리 확정 시
// 이름으로 다시 find-or-create되어 무시된다(digest-review-service.ts updateReview 참고).
export const DigestTopicDraftSchema = z.object({
  id: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(TOPIC_TITLE_MAX_LENGTH),
});
export type DigestTopicDraft = z.infer<typeof DigestTopicDraftSchema>;

export const DigestTagDraftSchema = TagDraftSchema.extend({
  id: z.string().uuid().nullable(),
});
export type DigestTagDraft = z.infer<typeof DigestTagDraftSchema>;

export const DigestDraftSchema = z.object({
  title: z.string().trim().min(1).max(DIGEST_TITLE_MAX_LENGTH),
  description: z.string().trim().min(1).max(DIGEST_DESCRIPTION_MAX_LENGTH),
  body: DigestBodySchema,
  topics: z.array(DigestTopicDraftSchema).max(DIGEST_TOPICS_MAX),
  tags: z.array(DigestTagDraftSchema).max(DIGEST_TAGS_MAX),
  // 기존 레퍼런스 인용(id)과 이 리뷰에서 새로 만들 레퍼런스 참조(key)는 별도 축 —
  // 신규는 확정 시점에야 id가 생기므로 key로만 가리킬 수 있다.
  referenceIds: z.array(z.string().uuid()),
  newReferenceKeys: z.array(z.string().trim().min(1)),
  externalUrls: z.array(z.string().url()).max(DIGEST_EXTERNAL_URLS_MAX),
});
export type DigestDraft = z.infer<typeof DigestDraftSchema>;

// Digest 리뷰 화면 전용 digest 항목 — DigestDraftSchema에 안정 id·명시적 순서를
// 얹는다. get이 내려준 id를 update가 그대로 되돌려보내 update_pending_ingestion이
// 같은 항목으로 매칭한다(DELETE+INSERT로 매 저장마다 id·순서가 흩어지던 문제의 해결책).
export const ReviewDigestDraftSchema = DigestDraftSchema.extend({
  id: z.string().uuid(),
  position: z.number().int().min(0),
  // 이 화면에서 가리킬 수 있는 신규 레퍼런스 후보는 항상 ReviewNewReferenceDraft.id
  // (실제 target_id) — 베이스 DigestDraftSchema의 임의 문자열 타입보다 좁힌다.
  newReferenceKeys: z.array(z.string().uuid()),
});
export type ReviewDigestDraft = z.infer<typeof ReviewDigestDraftSchema>;

// newReferenceKeys가 실제 신규 레퍼런스 목록을 가리키는지 — 끊긴 키는 확정 시
// 존재하지 않는 인용을 만들므로 경계에서 막는다. id는 이제 서버 생성이 아니라
// 클라이언트가 왕복시키는 값이라, 중복 id도 여기서 같이 막는다 — DB upsert가
// 같은 id를 두 번 받으면 두 번째가 첫 번째를 조용히 덮어써 후보 2개가 에러
// 없이 1개로 합쳐진다.
function refineReviewPayload(
  value: {
    digests: ReviewDigestDraft[];
    newReferences: ReviewNewReferenceDraft[];
  },
  ctx: z.RefinementCtx,
): void {
  const referenceIds = value.newReferences.map((reference) => reference.id);
  if (new Set(referenceIds).size !== referenceIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["newReferences"],
      message: "duplicate id in newReferences",
    });
  }

  const digestIds = value.digests.map((digest) => digest.id);
  if (new Set(digestIds).size !== digestIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["digests"],
      message: "duplicate id in digests",
    });
  }

  const ids = new Set(referenceIds);
  value.digests.forEach((digest, index) => {
    for (const key of digest.newReferenceKeys) {
      if (!ids.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["digests", index, "newReferenceKeys"],
          message: `unknown new reference key: ${key}`,
        });
      }
    }
  });
}

export const DigestReviewUpdateInputSchema = z
  .object({
    changesetId: z.string().uuid(),
    // 두 탭 동시 편집 가드 — get이 내려준 draftVersion을 그대로 되돌려보낸다.
    // 어긋나면 서버가 이 저장을 거절한다(update_pending_ingestion의 NM012).
    expectedVersion: z.number().int().min(1),
    digests: z.array(ReviewDigestDraftSchema).min(1).max(REVIEW_DIGESTS_MAX),
    newReferences: z
      .array(ReviewNewReferenceDraftSchema)
      .max(REVIEW_NEW_REFERENCES_MAX),
    // 병합 편집 없이 저장하는 왕복(제목만 고침 등)도 흔하므로 생략 시 빈 목록으로 —
    // 어느 기존 Reference도 다듬지 않았다는 뜻.
    referenceUpdates: z
      .array(ReferenceMergeUpdateSchema)
      .max(REVIEW_REFERENCE_UPDATES_MAX)
      .default([]),
  })
  .superRefine(refineReviewPayload);
export type DigestReviewUpdateInput = z.infer<
  typeof DigestReviewUpdateInputSchema
>;

export const DigestReviewGetInputSchema = z.object({
  spaceId: z.string().uuid(),
  number: z.number().int().min(1),
});
export type DigestReviewGetInput = z.infer<typeof DigestReviewGetInputSchema>;

export const DigestReviewConfirmInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type DigestReviewConfirmInput = z.infer<
  typeof DigestReviewConfirmInputSchema
>;

export const DigestReviewDiscardInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type DigestReviewDiscardInput = z.infer<
  typeof DigestReviewDiscardInputSchema
>;

export const DigestReviewRestoreInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type DigestReviewRestoreInput = z.infer<
  typeof DigestReviewRestoreInputSchema
>;

// 확정 Digest 직접 수정 — 옛 Digest를 archive하고 이 초안으로 새 Digest를 만든다(manual
// changeset). 초안 편집은 클라 상태로 하고 확정 때만 서버로 오므로 리뷰(pending 초안 persist)와
// 달리 단일 확정 페이로드다. newReferenceKeys 무결성은 리뷰와 같은 규칙으로 경계에서 막는다.
export const DigestEditConfirmInputSchema = z
  .object({
    digestId: z.string().uuid(),
    digest: DigestDraftSchema,
    newReferences: z
      .array(NewReferenceDraftSchema)
      .max(REVIEW_NEW_REFERENCES_MAX),
  })
  .superRefine((value, ctx) => {
    const keys = new Set(value.newReferences.map((reference) => reference.key));
    for (const key of value.digest.newReferenceKeys) {
      if (!keys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["digest", "newReferenceKeys"],
          message: `unknown new reference key: ${key}`,
        });
      }
    }
  });
export type DigestEditConfirmInput = z.infer<
  typeof DigestEditConfirmInputSchema
>;

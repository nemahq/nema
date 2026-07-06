import { z } from "zod";

import {
  DIGEST_DESCRIPTION_MAX_LENGTH,
  DIGEST_TITLE_MAX_LENGTH,
  DigestBodySchema,
} from "./digest";
import {
  REFERENCE_BODY_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH,
  ReferenceTypeSchema,
} from "./reference";
import { TagDraftSchema } from "./tag";
import { TOPIC_NAME_MAX_LENGTH } from "./topic";

// 멀티 라벨 보수적 상한 — 평소 1개, 명확히 다주제일 때만 여러 개. 군집화 방지.
export const DIGEST_TOPICS_MAX = 5;
export const DIGEST_TAGS_MAX = 5;
// 한 뭉치 안에 판단 유형이 섞이면 유형별로 쪼개진다(07-modeling Digest) —
// 정상 범위는 한 자릿수, 상한은 폭주 브레이크.
export const REVIEW_DIGESTS_MAX = 20;
export const REVIEW_NEW_REFERENCES_MAX = 20;
export const DIGEST_EXTERNAL_URLS_MAX = 20;
// 신규 레퍼런스 참조 키 — LLM 제안·리뷰 편집이 행 생성 전에 서로를 가리키는 로컬 식별자.
const NEW_REFERENCE_KEY_MAX_LENGTH = 20;

export const NewReferenceDraftSchema = z.object({
  key: z.string().trim().min(1).max(NEW_REFERENCE_KEY_MAX_LENGTH),
  type: ReferenceTypeSchema,
  title: z.string().trim().min(1).max(REFERENCE_TITLE_MAX_LENGTH),
  body: z.string().trim().min(1).max(REFERENCE_BODY_MAX_LENGTH),
});
export type NewReferenceDraft = z.infer<typeof NewReferenceDraftSchema>;

export const DigestDraftSchema = z.object({
  title: z.string().trim().min(1).max(DIGEST_TITLE_MAX_LENGTH),
  description: z.string().trim().min(1).max(DIGEST_DESCRIPTION_MAX_LENGTH),
  body: DigestBodySchema,
  topics: z
    .array(z.string().trim().min(1).max(TOPIC_NAME_MAX_LENGTH))
    .max(DIGEST_TOPICS_MAX),
  tags: z.array(TagDraftSchema).max(DIGEST_TAGS_MAX),
  // 기존 레퍼런스 인용(id)과 이 리뷰에서 새로 만들 레퍼런스 참조(key)는 별도 축 —
  // 신규는 확정 시점에야 id가 생기므로 key로만 가리킬 수 있다.
  referenceIds: z.array(z.string().uuid()),
  newReferenceKeys: z.array(z.string().trim().min(1)),
  externalUrls: z.array(z.string().url()).max(DIGEST_EXTERNAL_URLS_MAX),
});
export type DigestDraft = z.infer<typeof DigestDraftSchema>;

// newReferenceKeys가 실제 신규 레퍼런스 목록을 가리키는지 — 끊긴 키는 확정 시
// 존재하지 않는 인용을 만들므로 경계에서 막는다.
function refineReviewPayload(
  value: { digests: DigestDraft[]; newReferences: NewReferenceDraft[] },
  ctx: z.RefinementCtx,
): void {
  const keys = new Set(value.newReferences.map((reference) => reference.key));
  value.digests.forEach((digest, index) => {
    for (const key of digest.newReferenceKeys) {
      if (!keys.has(key)) {
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
    digests: z.array(DigestDraftSchema).min(1).max(REVIEW_DIGESTS_MAX),
    newReferences: z
      .array(NewReferenceDraftSchema)
      .max(REVIEW_NEW_REFERENCES_MAX),
  })
  .superRefine(refineReviewPayload);
export type DigestReviewUpdateInput = z.infer<
  typeof DigestReviewUpdateInputSchema
>;

export const DigestReviewGetInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type DigestReviewGetInput = z.infer<typeof DigestReviewGetInputSchema>;

export const DigestReviewConfirmInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type DigestReviewConfirmInput = z.infer<
  typeof DigestReviewConfirmInputSchema
>;

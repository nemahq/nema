import { z } from "zod";

import {
  DigestDraftSchema,
  NewReferenceDraftSchema,
  REVIEW_NEW_REFERENCES_MAX,
} from "./digest-review";

export const ArchiveStatementInputSchema = z.object({
  statementId: z.string().uuid(),
});
export type ArchiveStatementInput = z.infer<typeof ArchiveStatementInputSchema>;

export const RevertChangesetInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type RevertChangesetInput = z.infer<typeof RevertChangesetInputSchema>;

// 충돌 판정 — 승자 선택. 패자는 서버가 제안의 다른 끝점으로 유도한다(review-flow.md
// "충돌 판정 — 승자 선택").
export const ResolveConflictRelationInputSchema = z.object({
  changesetId: z.string().uuid(),
  winnerStatementId: z.string().uuid(),
});
export type ResolveConflictRelationInput = z.infer<
  typeof ResolveConflictRelationInputSchema
>;

// 중복 판정 — 병합. mergedDigest는 DigestEditConfirmInputSchema의 digest와 같은
// 계약(엔진 제안을 사람이 검토·수정한 최종 콘텐츠) — review-flow.md "중복 판정 — 병합".
export const ResolveDuplicateRelationInputSchema = z
  .object({
    changesetId: z.string().uuid(),
    mergedDigest: DigestDraftSchema,
    newReferences: z
      .array(NewReferenceDraftSchema)
      .max(REVIEW_NEW_REFERENCES_MAX)
      .default([]),
  })
  .superRefine((value, ctx) => {
    const keys = new Set(value.newReferences.map((reference) => reference.key));
    for (const key of value.mergedDigest.newReferenceKeys) {
      if (!keys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mergedDigest", "newReferenceKeys"],
          message: `unknown new reference key: ${key}`,
        });
      }
    }
  });
export type ResolveDuplicateRelationInput = z.infer<
  typeof ResolveDuplicateRelationInputSchema
>;

export const RejectPendingRelationInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type RejectPendingRelationInput = z.infer<
  typeof RejectPendingRelationInputSchema
>;

export const CHANGESET_LIST_LIMIT_DEFAULT = 20;
export const CHANGESET_LIST_LIMIT_MAX = 100;

export const ListChangesetsInputSchema = z.object({
  // changesets.number는 Space 안에서만 유일해서, 스코프 없이 여러 Space를 섞어
  // 반환하면 서로 다른 Space의 changeset이 같은 번호로 보일 수 있다 — 실제 화면은
  // 항상 넘겨야 한다. 미지정(source.create와 같은 결의 MCP·dev-harness 전용 폴백)
  // 시에만 서버가 기본 Space(가장 오래된 멤버십)로 대체한다.
  spaceId: z.string().uuid().optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(CHANGESET_LIST_LIMIT_MAX)
    .default(CHANGESET_LIST_LIMIT_DEFAULT),
  // 미지정 시 전체(open+closed 안 가림) — MCP 등 상태 필터가 필요 없는 소비처를 위한
  // 기본값.
  open: z
    .boolean()
    .optional()
    .describe(
      "true: only open (not yet reviewed). false: only closed (applied or discarded). omit: all statuses.",
    ),
  // changesets.number(Space 안 순차 증가값) 기준 커서.
  cursor: z.number().int().nullish(),
});
export type ListChangesetsInput = z.infer<typeof ListChangesetsInputSchema>;

export const GetChangesetByNumberInputSchema = z.object({
  spaceId: z.string().uuid(),
  number: z.number().int().min(1),
});
export type GetChangesetByNumberInput = z.infer<
  typeof GetChangesetByNumberInputSchema
>;

export const GetPendingRelationByNumberInputSchema = z.object({
  spaceId: z.string().uuid(),
  number: z.number().int().min(1),
});
export type GetPendingRelationByNumberInput = z.infer<
  typeof GetPendingRelationByNumberInputSchema
>;

export const RestorePendingRelationInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type RestorePendingRelationInput = z.infer<
  typeof RestorePendingRelationInputSchema
>;

// 변경 이력 모달(Digest 상세·Reference 상세 공용, surface-inventory.md "변경 이력")
// — 대상을 향한 manual changeset만. digest/reference 외 target_type은 이 모달의
// 대상이 아니다(manual은 애초에 그 둘만 만든다, 07-modeling.md).
export const ManualChangeHistoryTargetTypeSchema = z.enum([
  "digest",
  "reference",
]);
export type ManualChangeHistoryTargetType = z.infer<
  typeof ManualChangeHistoryTargetTypeSchema
>;

export const ManualChangeHistoryInputSchema = z.object({
  targetType: ManualChangeHistoryTargetTypeSchema,
  targetId: z.string().uuid(),
});
export type ManualChangeHistoryInput = z.infer<
  typeof ManualChangeHistoryInputSchema
>;

export const ACTIVE_RELATION_LIST_LIMIT_DEFAULT = 100;
export const ACTIVE_RELATION_LIST_LIMIT_MAX = 500;

export const ListActiveRelationsInputSchema = z.object({
  // 있으면 그 원문의 진술이 양끝 중 하나인 관계만 — 작업 탭 원문 상세용
  sourceId: z.string().uuid().optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(ACTIVE_RELATION_LIST_LIMIT_MAX)
    .default(ACTIVE_RELATION_LIST_LIMIT_DEFAULT),
});
export type ListActiveRelationsInput = z.infer<
  typeof ListActiveRelationsInputSchema
>;

import { z } from "zod";

export const ArchiveStatementInputSchema = z.object({
  statementId: z.string().uuid(),
});
export type ArchiveStatementInput = z.infer<typeof ArchiveStatementInputSchema>;

export const RevertChangesetInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type RevertChangesetInput = z.infer<typeof RevertChangesetInputSchema>;

export const ApplyPendingRelationInputSchema = z.object({
  changesetId: z.string().uuid(),
});
export type ApplyPendingRelationInput = z.infer<
  typeof ApplyPendingRelationInputSchema
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
  // 미지정 시 전체(open+closed 안 가림) — ClosedReviewScreen처럼 changeset을
  // id로 찾으려고 전체를 훑는 소비처를 위한 폴백.
  open: z
    .boolean()
    .optional()
    .describe(
      "true: only pending (not yet reviewed). false: only applied or rejected. omit: all statuses.",
    ),
  // changesets.number(Space 안 순차 증가값) 기준 커서.
  cursor: z.number().int().nullish(),
});
export type ListChangesetsInput = z.infer<typeof ListChangesetsInputSchema>;

export const ACTIVE_RELATION_LIST_LIMIT_DEFAULT = 100;
export const ACTIVE_RELATION_LIST_LIMIT_MAX = 500;

export const ListActiveRelationsInputSchema = z.object({
  // 있으면 그 원본의 진술이 양끝 중 하나인 관계만 — 작업 탭 원본 상세용
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

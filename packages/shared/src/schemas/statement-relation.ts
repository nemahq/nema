import { z } from "zod";

// 관계 5종 — DB enum relation_type의 SSOT(값·순서 모두 DB와 동일하게 유지).
// 워커 판정 스키마·꺼내기 표식·향후 프런트 렌더가 이 한 정의를 참조한다.
// 표시 순서는 별도(RELATION_ORDER). 인과·시간순·연관은 보류(동작이 갈리면 추가).
// duplicates는 엔진의 relations 출력엔 없다(별도 duplicates 채널) — 판정 스키마는
// 이 SSOT에서 duplicates를 제외해 좁힌다(relation-judgment.ts).
export const RELATION_TYPES = [
  "supports",
  "conflicts",
  "replaces",
  "resolves",
  "duplicates",
] as const;

export const RelationTypeSchema = z.enum(RELATION_TYPES);
export type RelationType = z.infer<typeof RelationTypeSchema>;

export const RELATION_STATUSES = ["active", "archived"] as const;

export const RelationStatusSchema = z.enum(RELATION_STATUSES);
export type RelationStatus = z.infer<typeof RelationStatusSchema>;

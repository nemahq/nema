import { z } from "zod";

// 관계 4종 — DB enum relation_type의 SSOT. 워커 판정 스키마·꺼내기 표식·향후
// 프런트 렌더가 이 한 정의를 참조한다. 인과·시간순·연관은 보류(동작이 갈리면 추가).
export const RELATION_TYPES = [
  "supports",
  "conflicts",
  "replaces",
  "resolves",
] as const;

export const RelationTypeSchema = z.enum(RELATION_TYPES);
export type RelationType = z.infer<typeof RelationTypeSchema>;

export const RELATION_STATUSES = ["active", "archived"] as const;

export const RelationStatusSchema = z.enum(RELATION_STATUSES);
export type RelationStatus = z.infer<typeof RelationStatusSchema>;

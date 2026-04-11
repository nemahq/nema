import type { EntityType } from "@nema-io/shared";

export const ENTITY_TYPE_COLOR: Record<EntityType, string> = {
  Topic: "#818CF8",
  Person: "#FBBF24",
  Organization: "#60A5FA",
  Project: "#C084FC",
  Event: "#FB7185",
  Location: "#4ADE80",
};

// Record 기반으로 선언해 신규 EntityType 추가 시 컴파일 에러로 누락 방지.
const ENTITY_TYPE_RANK: Record<EntityType, number> = {
  Topic: 0,
  Person: 1,
  Organization: 2,
  Project: 3,
  Event: 4,
  Location: 5,
};

export const ENTITY_TYPE_ORDER: readonly EntityType[] = (
  Object.keys(ENTITY_TYPE_RANK) as EntityType[]
).sort((a, b) => ENTITY_TYPE_RANK[a] - ENTITY_TYPE_RANK[b]);

export const ENTITY_LIST_STALE_TIME_MS = 300_000;

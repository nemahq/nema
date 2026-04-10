import type { EntityType } from "@nema-io/shared";

export const ENTITY_TYPE_COLOR: Record<EntityType, string> = {
  Topic: "#818CF8",
  Person: "#FBBF24",
  Organization: "#60A5FA",
  Project: "#C084FC",
  Event: "#FB7185",
  Location: "#4ADE80",
};

export const ENTITY_TYPE_ORDER: EntityType[] = [
  "Topic",
  "Person",
  "Organization",
  "Project",
  "Event",
  "Location",
];

export const ENTITY_LIST_STALE_TIME_MS = 300_000;

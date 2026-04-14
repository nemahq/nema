import type { EntityType } from "@nema-io/shared";

import type { TranslationKey } from "@web/lib/tolgee";

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

export const ENTITY_TYPE_LABEL_KEY: Record<EntityType, TranslationKey> = {
  Topic: "memory.entity_type_topic",
  Person: "memory.entity_type_person",
  Organization: "memory.entity_type_organization",
  Project: "memory.entity_type_project",
  Event: "memory.entity_type_event",
  Location: "memory.entity_type_location",
};

export const ENTITY_LIST_STALE_TIME_MS = 300_000;

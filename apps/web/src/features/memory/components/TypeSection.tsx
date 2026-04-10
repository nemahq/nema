import type { EntitySummary, EntityType } from "@nema-io/shared";

import { EntityChip } from "@web/features/memory/components/EntityChip";
import { ENTITY_TYPE_COLOR } from "@web/features/memory/constants";
import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

const ENTITY_TYPE_LABEL_KEY: Record<EntityType, TranslationKey> = {
  Topic: "memory.entity_type_topic",
  Person: "memory.entity_type_person",
  Organization: "memory.entity_type_organization",
  Project: "memory.entity_type_project",
  Event: "memory.entity_type_event",
  Location: "memory.entity_type_location",
};

interface TypeSectionProps {
  type: EntityType;
  entities: EntitySummary[];
  selectedEntity?: string;
  onEntityClick?: (entity: EntitySummary) => void;
}

export function TypeSection({
  type,
  entities,
  selectedEntity,
  onEntityClick,
}: TypeSectionProps) {
  const { t } = useTranslation();
  const color = ENTITY_TYPE_COLOR[type];

  return (
    <section className="mb-8">
      <div className="mb-3.5 flex items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-semibold text-fg-secondary">
          {t(ENTITY_TYPE_LABEL_KEY[type])}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {entities.map((entity) => (
          <EntityChip
            key={`${entity.type}-${entity.nameEn ?? entity.name}`}
            name={entity.name}
            documentCount={entity.documentCount}
            selected={selectedEntity === entity.name}
            onClick={() => onEntityClick?.(entity)}
          />
        ))}
      </div>
    </section>
  );
}

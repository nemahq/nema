import type { EntitySummary, EntityType } from "@nema-io/shared";

import { EntityChip } from "@web/features/memory/components/EntityChip";
import {
  ENTITY_TYPE_COLOR,
  ENTITY_TYPE_LABEL_KEY,
} from "@web/features/memory/constants";
import { useTranslation } from "@web/lib/tolgee";

interface EntityTypeGroupProps {
  type: EntityType;
  entities: EntitySummary[];
}

export function EntityTypeGroup({ type, entities }: EntityTypeGroupProps) {
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
            key={`${entity.type}-${entity.name}`}
            name={entity.name}
            documentCount={entity.documentCount}
          />
        ))}
      </div>
    </section>
  );
}

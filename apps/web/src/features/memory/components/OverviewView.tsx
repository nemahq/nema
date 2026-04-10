import { Suspense, useMemo } from "react";

import type { EntitySummary, EntityType } from "@nema-io/shared";

import { TypeSection } from "@web/features/memory/components/TypeSection";
import { ENTITY_TYPE_ORDER } from "@web/features/memory/constants";
import { useEntityListSuspenseQuery } from "@web/features/memory/hooks/useEntityListQuery";

function OverviewContent() {
  const [entities] = useEntityListSuspenseQuery();

  const grouped = useMemo(() => {
    const map = new Map<EntityType, EntitySummary[]>();
    for (const entity of entities) {
      const list = map.get(entity.type);
      if (list) {
        list.push(entity);
      } else {
        map.set(entity.type, [entity]);
      }
    }
    return map;
  }, [entities]);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
      {ENTITY_TYPE_ORDER.map((type) => {
        const list = grouped.get(type);
        if (!list?.length) {
          return null;
        }
        return <TypeSection key={type} type={type} entities={list} />;
      })}
    </div>
  );
}

export function OverviewView() {
  return (
    <Suspense>
      <OverviewContent />
    </Suspense>
  );
}

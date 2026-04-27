import { Suspense, useMemo } from "react";

import { EntityTypeGroup } from "@web/features/memory/components/EntityTypeGroup";
import { OverviewSkeleton } from "@web/features/memory/components/OverviewSkeleton";
import { ENTITY_TYPE_ORDER } from "@web/features/memory/constants";
import { useEntityListSuspenseQuery } from "@web/features/memory/hooks/useEntityListQuery";

function OverviewContent() {
  const [entities] = useEntityListSuspenseQuery();

  const grouped = useMemo(
    () => Map.groupBy(entities, (entity) => entity.type),
    [entities],
  );

  return (
    <div className="px-8 py-6">
      {ENTITY_TYPE_ORDER.map((type) => {
        const list = grouped.get(type);
        if (!list?.length) {
          return null;
        }
        return <EntityTypeGroup key={type} type={type} entities={list} />;
      })}
    </div>
  );
}

export function Overview() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewContent />
    </Suspense>
  );
}

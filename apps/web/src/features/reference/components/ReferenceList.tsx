import { Suspense, useState } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { useReferenceListSuspenseQuery } from "@web/features/reference/hooks/useReferenceListQuery";
import {
  DEFAULT_REFERENCE_LIST_FILTER,
  filterReferences,
  type ReferenceListFilterState,
  type ReferenceSortDirection,
  type ReferenceSortKey,
  sortReferences,
} from "@web/features/reference/utils/referenceListFilters";

import { ReferenceEmptyState } from "./ReferenceEmptyState";
import { ReferenceListFilters } from "./ReferenceListFilters";
import { ReferenceTable } from "./ReferenceTable";
import { ReferenceTableSkeleton } from "./ReferenceTableSkeleton";

interface ReferenceListContentProps {
  onSelectReference: (referenceId: string) => void;
}

function ReferenceListContent({
  onSelectReference,
}: ReferenceListContentProps) {
  const [{ references }] = useReferenceListSuspenseQuery();
  const [filter, setFilter] = useState<ReferenceListFilterState>(
    DEFAULT_REFERENCE_LIST_FILTER,
  );
  const [sortKey, setSortKey] = useState<ReferenceSortKey>("title");
  const [sortDirection, setSortDirection] =
    useState<ReferenceSortDirection>("asc");

  if (references.length === 0) {
    return <ReferenceEmptyState />;
  }

  function handleSortChange(key: ReferenceSortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  const filtered = filterReferences(references, filter);
  const sorted = sortReferences(filtered, sortKey, sortDirection);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReferenceListFilters filter={filter} onChange={setFilter} />
      <ReferenceTable
        references={sorted}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        onSelectReference={onSelectReference}
      />
    </div>
  );
}

export function ReferenceList(props: ReferenceListContentProps) {
  return (
    <ErrorBoundary
      boundaryName="reference-list"
      fallbackRender={(fallbackProps) => (
        <SectionErrorFallback {...fallbackProps} />
      )}
    >
      <Suspense fallback={<ReferenceTableSkeleton />}>
        <ReferenceListContent {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

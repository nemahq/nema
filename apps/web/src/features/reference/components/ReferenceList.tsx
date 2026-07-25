import { Suspense, useRef, useState } from "react";

import { REFERENCE_LIST_LIMIT_DEFAULT } from "@nema-io/shared";
import { Text } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import {
  DEFAULT_REFERENCE_LIST_FILTER,
  type ReferenceListFilterState,
  type ReferenceSortDirection,
  type ReferenceSortKey,
} from "@web/features/reference/utils/referenceListFilters";
import { useDebouncedValue } from "@web/hooks/useDebouncedValue";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useReferenceListInfiniteQuery } from "@web/hooks/useReferenceListQuery";
import { useTranslation } from "@web/lib/tolgee";

import { ReferenceEmptyState } from "./ReferenceEmptyState";
import { ReferenceListFilters } from "./ReferenceListFilters";
import { ReferenceTable } from "./ReferenceTable";
import { ReferenceTableSkeleton } from "./ReferenceTableSkeleton";

const REFERENCE_SEARCH_DEBOUNCE_MS = 300;

interface ReferenceTableContentProps {
  search: string | undefined;
  type: ReferenceListFilterState["type"];
  status: ReferenceListFilterState["status"];
  sortKey: ReferenceSortKey;
  sortDirection: ReferenceSortDirection;
  isDefaultFilter: boolean;
  onSortChange: (key: ReferenceSortKey) => void;
  onSelectReference: (referenceId: string) => void;
}

function ReferenceTableContent({
  search,
  type,
  status,
  sortKey,
  sortDirection,
  isDefaultFilter,
  onSortChange,
  onSelectReference,
}: ReferenceTableContentProps) {
  const { t } = useTranslation();
  const [data, query] = useReferenceListInfiniteQuery({
    search,
    type: type === "all" ? undefined : type,
    status,
    sortKey,
    sortDirection,
    limit: REFERENCE_LIST_LIMIT_DEFAULT,
  });
  const references = data.pages.flatMap((page) => page.references);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useIntersectionEffect({
    ref: sentinelRef,
    onIntersect: query.fetchNextPage,
    enabled: query.hasNextPage && !query.isFetchingNextPage,
  });

  // 검색·필터가 기본값인데도 첫 페이지가 비어 있으면 워크스페이스 자체가
  // 아직 비어 있다는 뜻 — 아카이브만 있어 활성 필터에서 안 보이는 경우까지
  // 구분하려면 별도 무필터 조회가 필요해 이번엔 근사치로 판단한다.
  if (references.length === 0 && isDefaultFilter) {
    return <ReferenceEmptyState />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ReferenceTable
        references={references}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        onSelectReference={onSelectReference}
      />
      {query.hasNextPage ? (
        <div ref={sentinelRef} className="flex flex-col">
          {query.isFetchingNextPage && <ReferenceTableSkeleton />}
        </div>
      ) : (
        references.length > 0 && (
          <Text size="xs" color="tertiary" className="py-4 text-center">
            {t("common.list_end")}
          </Text>
        )
      )}
    </div>
  );
}

interface ReferenceListContentProps {
  onSelectReference: (referenceId: string) => void;
}

export function ReferenceList({
  onSelectReference,
}: ReferenceListContentProps) {
  const [filter, setFilter] = useState<ReferenceListFilterState>(
    DEFAULT_REFERENCE_LIST_FILTER,
  );
  const [sortKey, setSortKey] = useState<ReferenceSortKey>("title");
  const [sortDirection, setSortDirection] =
    useState<ReferenceSortDirection>("asc");
  const debouncedSearch = useDebouncedValue(
    filter.search,
    REFERENCE_SEARCH_DEBOUNCE_MS,
  );
  const trimmedSearch = debouncedSearch.trim();
  const isDefaultFilter =
    trimmedSearch === "" &&
    filter.type === "all" &&
    filter.status === DEFAULT_REFERENCE_LIST_FILTER.status;

  function handleSortChange(key: ReferenceSortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReferenceListFilters filter={filter} onChange={setFilter} />
      {/* 필터바는 검색 타이핑 중에도 마운트 상태를 유지해야 해서 이 바운더리
          밖에 둔다 — 서스펜스가 다시 걸리는 건 목록 영역뿐. */}
      <ErrorBoundary
        boundaryName="reference-table"
        fallbackRender={(fallbackProps) => (
          <SectionErrorFallback {...fallbackProps} />
        )}
      >
        <Suspense fallback={<ReferenceTableSkeleton />}>
          <ReferenceTableContent
            search={trimmedSearch === "" ? undefined : trimmedSearch}
            type={filter.type}
            status={filter.status}
            sortKey={sortKey}
            sortDirection={sortDirection}
            isDefaultFilter={isDefaultFilter}
            onSortChange={handleSortChange}
            onSelectReference={onSelectReference}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

import type { ReferenceType } from "@nema-io/shared";

import type { ReferenceSummary } from "@web/features/reference/types";

export type ReferenceStatusFilter = "active" | "archived" | "all";
export type ReferenceSortKey = "title" | "createdAt";
export type ReferenceSortDirection = "asc" | "desc";

export interface ReferenceListFilterState {
  search: string;
  type: ReferenceType | "all";
  status: ReferenceStatusFilter;
}

export const DEFAULT_REFERENCE_LIST_FILTER: ReferenceListFilterState = {
  search: "",
  type: "all",
  status: "active",
};

export function filterReferences(
  references: ReferenceSummary[],
  filter: ReferenceListFilterState,
): ReferenceSummary[] {
  const normalizedSearch = filter.search.trim().toLowerCase();

  return references.filter((reference) => {
    if (filter.status !== "all" && reference.status !== filter.status) {
      return false;
    }
    if (filter.type !== "all" && reference.type !== filter.type) {
      return false;
    }
    if (
      normalizedSearch !== "" &&
      !reference.title.toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    return true;
  });
}

export function sortReferences(
  references: ReferenceSummary[],
  sortKey: ReferenceSortKey,
  direction: ReferenceSortDirection,
): ReferenceSummary[] {
  const sorted = [...references].sort((a, b) => {
    switch (sortKey) {
      case "title":
        return a.title.localeCompare(b.title, "ko");
      case "createdAt":
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      default:
        return 0;
    }
  });
  return direction === "asc" ? sorted : sorted.reverse();
}

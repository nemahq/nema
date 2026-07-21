import type {
  ReferenceListSortDirection,
  ReferenceListSortKey,
  ReferenceListStatusFilter,
  ReferenceType,
} from "@nema-io/shared";

export type ReferenceStatusFilter = ReferenceListStatusFilter;
export type ReferenceSortKey = ReferenceListSortKey;
export type ReferenceSortDirection = ReferenceListSortDirection;

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

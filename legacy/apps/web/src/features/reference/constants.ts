import { REFERENCE_TYPES, type ReferenceType } from "@nema-io/shared";

import type {
  ReferenceListFilterState,
  ReferenceStatusFilter,
} from "@web/features/reference/utils/referenceListFilters";
import type { TranslationKey } from "@web/lib/tolgee";

export { REFERENCE_TYPES };

export const REFERENCE_TYPE_LABEL_KEY: Record<ReferenceType, TranslationKey> = {
  person: "reference.type_person",
  organization: "reference.type_organization",
  project: "reference.type_project",
  product: "reference.type_product",
  term: "reference.type_term",
};

const REFERENCE_STATUS_FILTERS: readonly ReferenceStatusFilter[] = [
  "active",
  "archived",
  "all",
];

export function isReferenceTypeFilter(
  value: string,
): value is ReferenceListFilterState["type"] {
  return (
    value === "all" || (REFERENCE_TYPES as readonly string[]).includes(value)
  );
}

export function isReferenceStatusFilter(
  value: string,
): value is ReferenceStatusFilter {
  return (REFERENCE_STATUS_FILTERS as readonly string[]).includes(value);
}

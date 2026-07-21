import { Text } from "@nema-io/weave";

import type { ReferenceSummary } from "@web/features/reference/types";
import type {
  ReferenceSortDirection,
  ReferenceSortKey,
} from "@web/features/reference/utils/referenceListFilters";
import { useTranslation } from "@web/lib/tolgee";

import { ReferenceTableHeader } from "./ReferenceTableHeader";
import { ReferenceTableRow } from "./ReferenceTableRow";

interface ReferenceTableProps {
  references: ReferenceSummary[];
  sortKey: ReferenceSortKey;
  sortDirection: ReferenceSortDirection;
  onSortChange: (key: ReferenceSortKey) => void;
  onSelectReference: (referenceId: string) => void;
}

export function ReferenceTable({
  references,
  sortKey,
  sortDirection,
  onSortChange,
  onSelectReference,
}: ReferenceTableProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col">
      <ReferenceTableHeader
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />
      {references.length === 0 ? (
        <Text size="sm" color="tertiary" className="py-12 text-center">
          {t("reference.list_filtered_empty")}
        </Text>
      ) : (
        <div className="flex flex-col gap-0.5 py-1">
          {references.map((reference) => (
            <ReferenceTableRow
              key={reference.id}
              reference={reference}
              onSelect={onSelectReference}
            />
          ))}
        </div>
      )}
    </div>
  );
}

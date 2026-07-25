import { ChevronDown, ChevronUp } from "@nema-io/weave/icons";

import type {
  ReferenceSortDirection,
  ReferenceSortKey,
} from "@web/features/reference/utils/referenceListFilters";
import { useTranslation } from "@web/lib/tolgee";

import { REFERENCE_TABLE_GRID_CLASSNAME } from "./referenceTableLayout";

interface ReferenceTableHeaderProps {
  sortKey: ReferenceSortKey;
  sortDirection: ReferenceSortDirection;
  onSortChange: (key: ReferenceSortKey) => void;
}

export function ReferenceTableHeader({
  sortKey,
  sortDirection,
  onSortChange,
}: ReferenceTableHeaderProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`${REFERENCE_TABLE_GRID_CLASSNAME} border-b border-border px-3 pb-2 text-xs font-medium text-fg-tertiary`}
    >
      <span>{t("reference.column_type")}</span>
      <SortableHeaderCell
        label={t("reference.column_title")}
        active={sortKey === "title"}
        direction={sortDirection}
        onClick={() => onSortChange("title")}
      />
      <span>{t("reference.column_status")}</span>
      <SortableHeaderCell
        label={t("reference.column_created_at")}
        active={sortKey === "createdAt"}
        direction={sortDirection}
        onClick={() => onSortChange("createdAt")}
      />
    </div>
  );
}

interface SortableHeaderCellProps {
  label: string;
  active: boolean;
  direction: ReferenceSortDirection;
  onClick: () => void;
}

// 자체 활성 표현(정렬 방향 아이콘)이 있는 헤더 토글이라 weave Button을
// 안 쓴다(docs/guides/weave-usage.md 표 — 탭·내비게이션과 같은 결).
function SortableHeaderCell({
  label,
  active,
  direction,
  onClick,
}: SortableHeaderCellProps) {
  const Icon = direction === "asc" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-0.5 hover:text-fg-primary ${active ? "text-fg-primary" : ""}`}
    >
      {label}
      {active && <Icon className="size-3" />}
    </button>
  );
}

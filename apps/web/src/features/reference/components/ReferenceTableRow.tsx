import { memo } from "react";

import { Badge, Text } from "@nema-io/weave";

import type { ReferenceSummary } from "@web/features/reference/types";
import { formatAbsoluteDateTime } from "@web/features/reference/utils/formatAbsoluteDateTime";
import { useTranslation } from "@web/lib/tolgee";

import { REFERENCE_TABLE_GRID_CLASSNAME } from "./referenceTableLayout";
import { ReferenceTypeBadge } from "./ReferenceTypeBadge";

interface ReferenceTableRowProps {
  reference: ReferenceSummary;
  onSelect: (referenceId: string) => void;
}

export const ReferenceTableRow = memo(function ReferenceTableRow({
  reference,
  onSelect,
}: ReferenceTableRowProps) {
  const { t } = useTranslation();

  return (
    // weave Button 대신 raw button — 행 전체가 클릭 타깃이면서 내부에 서로 다른
    // 타이포(Text 사이즈·Badge)를 그대로 노출해야 해서, ChangesetListRow의
    // 행 전체 클릭 패턴(raw Link)과 같은 이유로 Button의 강제 타이포를 우회한다.
    <button
      type="button"
      onClick={() => onSelect(reference.id)}
      className={`${REFERENCE_TABLE_GRID_CLASSNAME} items-center rounded-lg px-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-raised-hover/40`}
    >
      <ReferenceTypeBadge type={reference.type} />
      <Text as="span" size="sm" weight="medium" className="min-w-0 truncate">
        {reference.title}
      </Text>
      {reference.status === "archived" ? (
        <Badge variant="neutral" size="sm">
          {t("reference.filter_status_archived")}
        </Badge>
      ) : (
        <span />
      )}
      <Text as="span" size="xs" color="tertiary">
        {formatAbsoluteDateTime(reference.createdAt)}
      </Text>
    </button>
  );
});

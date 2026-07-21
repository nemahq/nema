import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";
import { Search } from "@nema-io/weave/icons";

import {
  isReferenceStatusFilter,
  isReferenceTypeFilter,
  REFERENCE_TYPE_LABEL_KEY,
  REFERENCE_TYPES,
} from "@web/features/reference/constants";
import type { ReferenceListFilterState } from "@web/features/reference/utils/referenceListFilters";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceListFiltersProps {
  filter: ReferenceListFilterState;
  onChange: (filter: ReferenceListFilterState) => void;
}

export function ReferenceListFilters({
  filter,
  onChange,
}: ReferenceListFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary" />
        <Input
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder={t("reference.search_placeholder")}
          className="pl-8"
        />
      </div>

      <Select
        value={filter.type}
        onValueChange={(value) => {
          if (isReferenceTypeFilter(value)) {
            onChange({ ...filter, type: value });
          }
        }}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("reference.filter_type_all")}</SelectItem>
          {REFERENCE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {t(REFERENCE_TYPE_LABEL_KEY[type])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.status}
        onValueChange={(value) => {
          if (isReferenceStatusFilter(value)) {
            onChange({ ...filter, status: value });
          }
        }}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">
            {t("reference.filter_status_active")}
          </SelectItem>
          <SelectItem value="archived">
            {t("reference.filter_status_archived")}
          </SelectItem>
          <SelectItem value="all">
            {t("reference.filter_status_all")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

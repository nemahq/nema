import type { ReferenceType } from "@nema-io/shared";
import { Badge } from "@nema-io/weave";

import { REFERENCE_TYPE_LABEL_KEY } from "@web/features/reference/constants";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceTypeBadgeProps {
  type: ReferenceType;
}

export function ReferenceTypeBadge({ type }: ReferenceTypeBadgeProps) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline-subtle" size="sm">
      {t(REFERENCE_TYPE_LABEL_KEY[type])}
    </Badge>
  );
}

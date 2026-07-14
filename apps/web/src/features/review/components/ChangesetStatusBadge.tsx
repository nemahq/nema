import { Badge } from "@nema-io/weave";

import { CHANGESET_STATUS_META } from "@web/features/review/constants";
import type { ChangesetStatus } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetStatusBadgeProps {
  status: ChangesetStatus;
  className?: string;
}

export function ChangesetStatusBadge({
  status,
  className,
}: ChangesetStatusBadgeProps) {
  const { t } = useTranslation();
  const meta = CHANGESET_STATUS_META[status];

  return (
    <Badge variant={meta.variant} className={className}>
      {t(meta.labelKey)}
    </Badge>
  );
}

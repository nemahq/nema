import { Badge } from "@nema-io/weave";

import { changesetStatusMeta } from "@web/features/review/constants";
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
  const meta = changesetStatusMeta(status);

  return (
    <Badge variant={meta.variant} className={className}>
      {t(meta.labelKey)}
    </Badge>
  );
}

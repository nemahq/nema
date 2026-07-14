import { Badge } from "@nema-io/weave";

import { changesetStatusMeta } from "@web/features/review/constants";
import type {
  ChangesetStatus,
  ChangesetType,
} from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetStatusBadgeProps {
  status: ChangesetStatus;
  type: ChangesetType;
  className?: string;
}

export function ChangesetStatusBadge({
  status,
  type,
  className,
}: ChangesetStatusBadgeProps) {
  const { t } = useTranslation();
  const meta = changesetStatusMeta(status, type);

  return (
    <Badge variant={meta.variant} className={className}>
      {t(meta.labelKey)}
    </Badge>
  );
}

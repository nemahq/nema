import type { DigestType } from "@nema-io/shared";
import { Badge } from "@nema-io/weave";

import { DIGEST_TYPE_LABEL_KEY } from "@web/features/digest/constants";
import { useTranslation } from "@web/lib/tolgee";

interface DigestTypeBadgeProps {
  type: DigestType;
}

export function DigestTypeBadge({ type }: DigestTypeBadgeProps) {
  const { t } = useTranslation();
  return <Badge variant="outline">{t(DIGEST_TYPE_LABEL_KEY[type])}</Badge>;
}

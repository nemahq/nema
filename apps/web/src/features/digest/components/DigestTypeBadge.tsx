import type { DigestType } from "@nema-io/shared";
import { Badge, cn } from "@nema-io/weave";

import {
  DIGEST_TYPE_COLOR,
  DIGEST_TYPE_ICON,
  DIGEST_TYPE_LABEL_KEY,
} from "@web/features/digest/constants";
import { useTranslation } from "@web/lib/tolgee";

interface DigestTypeBadgeProps {
  type: DigestType;
}

// DigestReadonlyCard(리뷰 읽기 전용 카드)와 같은 시각 — outline + 아이콘 + 라벨.
// Chip이 아니라 Badge를 쓴다: Chip은 onClick 없이도 항상 <button>이라 이 읽기
// 전용 목록에서도 눌릴 것처럼 보인다.
export function DigestTypeBadge({ type }: DigestTypeBadgeProps) {
  const { t } = useTranslation();
  const TypeIcon = DIGEST_TYPE_ICON[type];

  return (
    <Badge
      shape="pill"
      variant="outline"
      className={cn("shrink-0 gap-1", DIGEST_TYPE_COLOR[type])}
    >
      <TypeIcon className="size-3" />
      {t(DIGEST_TYPE_LABEL_KEY[type])}
    </Badge>
  );
}

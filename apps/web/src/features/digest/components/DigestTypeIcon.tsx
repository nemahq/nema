import type { DigestType } from "@nema-io/shared";
import { Badge } from "@nema-io/weave";

import {
  DIGEST_TYPE_COLOR,
  DIGEST_TYPE_ICON,
} from "@web/features/digest/constants";

interface DigestTypeIconProps {
  type: DigestType;
}

// 목록 행 전용 — 라벨 없이 아이콘만 담는다. 라벨 폭이 유형마다 달라 제목
// 시작선이 행마다 어긋나던 걸 고정 정원(shape="circle")으로 맞춘다.
export function DigestTypeIcon({ type }: DigestTypeIconProps) {
  const TypeIcon = DIGEST_TYPE_ICON[type];

  return (
    <Badge
      shape="circle"
      variant="neutral"
      outline={false}
      className={DIGEST_TYPE_COLOR[type]}
    >
      <TypeIcon className="size-3" />
    </Badge>
  );
}

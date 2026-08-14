import type { DigestType } from "@nema-io/shared";
import { Badge } from "@nema-io/weave";

import {
  DIGEST_TYPE_COLOR,
  DIGEST_TYPE_ICON,
  DIGEST_TYPE_LABEL_KEY,
} from "@web/features/digest/constants";
import { useTranslation } from "@web/lib/tolgee";

interface DigestTypeIconProps {
  type: DigestType;
}

// 목록 행 전용 — 라벨 없이 아이콘만 담는다. 라벨 폭이 유형마다 달라 제목
// 시작선이 행마다 어긋나던 걸 고정 정원(shape="circle")으로 맞춘다.
// weave-usage.md는 "아이콘 포함 + 상태별 분기"엔 Badge를 안 쓴다고 하지만,
// shape="circle"이 주는 size-5·중앙정렬·shrink-0을 raw span으로 다시 그리는
// 비용이 이 규칙을 지키는 값보다 크다.
export function DigestTypeIcon({ type }: DigestTypeIconProps) {
  const { t } = useTranslation();
  const TypeIcon = DIGEST_TYPE_ICON[type];

  return (
    <Badge
      shape="circle"
      variant="neutral"
      outline={false}
      className={DIGEST_TYPE_COLOR[type]}
    >
      <TypeIcon className="size-3" aria-hidden="true" />
      {/* 라벨을 안 그리는 자리라(고정 정원 유지가 목적) 스크린리더용
          텍스트만 남긴다 — 시각 채널(아이콘·색)로만 전달되던 유형 정보가
          접근성 트리에서 사라지지 않게 한다. */}
      <span className="sr-only">{t(DIGEST_TYPE_LABEL_KEY[type])}</span>
    </Badge>
  );
}

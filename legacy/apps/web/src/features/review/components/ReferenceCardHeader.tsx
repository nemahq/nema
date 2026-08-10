import type { ReferenceType } from "@nema-io/shared";

import { CardViewedToggle } from "./CardViewedToggle";
import { NewReferenceIndicator } from "./NewReferenceIndicator";
import { ReferenceCardMenu } from "./ReferenceCardMenu";
import { ReferenceTypePicker } from "./ReferenceTypePicker";

interface ReferenceCardHeaderProps {
  type: ReferenceType;
  disabled: boolean;
  viewed: boolean;
  onToggleViewed: () => void;
  onChangeType: (next: ReferenceType) => void;
  onRemove: () => void;
}

// DigestCardHeader와 같은 좌우 구조 — 좌: 상시 노출 타입, 우: 읽음·메뉴. Topic·
// 원문 보기는 없다(Reference는 Topic에 안 묶이고, 원문 대조는 이번 라운드 범위 밖).
export function ReferenceCardHeader({
  type,
  disabled,
  viewed,
  onToggleViewed,
  onChangeType,
  onRemove,
}: ReferenceCardHeaderProps) {
  return (
    // relative — NewReferenceIndicator를 카드 전체가 아니라 이 행 하나에만 top-1/2로
    // 세로 중앙정렬시키기 위한 기준점. 예전엔 카드 워시 전체를 기준으로 한 고정
    // top 값(padding+타입 Chip 높이 계산)을 썼는데, 실측과 어긋나 타입 Chip과
    // 눈에 띄게 안 맞았다 — 이 행 자신의 높이(=타입 Chip 높이)에 50%로 걸면
    // Chip 높이가 나중에 바뀌어도 항상 정확히 맞는다.
    <div className="relative flex items-center justify-between gap-2">
      <NewReferenceIndicator />
      <ReferenceTypePicker
        type={type}
        disabled={disabled}
        onChangeType={onChangeType}
      />
      <div className="flex shrink-0 items-center gap-2">
        <CardViewedToggle
          viewed={viewed}
          disabled={disabled}
          onToggleViewed={onToggleViewed}
        />
        <ReferenceCardMenu disabled={disabled} onRemove={onRemove} />
      </div>
    </div>
  );
}

import { Badge } from "@nema-io/weave";

import {
  isReferenceType,
  REFERENCE_TYPE_LABEL,
} from "@web/features/review/constants";

import { CardViewedToggle } from "./CardViewedToggle";
import { ReferenceMergeCardMenu } from "./ReferenceMergeCardMenu";

interface ReferenceMergeCardHeaderProps {
  type: string;
  disabled: boolean;
  viewed: boolean;
  // 이미 원본과 같으면 되돌릴 것이 없다.
  restorable: boolean;
  onToggleViewed: () => void;
  onRestore: () => void;
}

// ReferenceCardHeader와 같은 좌우 구조지만 타입이 정적 Badge다 — 기존 Reference의
// 재분류는 review-flow 밖의 무거운 조작이라 여기선 읽기 전용이다.
export function ReferenceMergeCardHeader({
  type,
  disabled,
  viewed,
  restorable,
  onToggleViewed,
  onRestore,
}: ReferenceMergeCardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      {/* ReferenceTypePicker(Chip)와 같은 자리 — 정적/인터랙티브 버전이 크기·모양이
          같아야 해서 shape="pill"로 맞춘다(Badge 기본은 각진 rounded-[4px]).
          글자색은 OUTLINE_TONE_CLASSNAME을 Badge·Chip이 공유해 이미 일치한다. */}
      <Badge variant="outline" shape="pill">
        {isReferenceType(type) ? REFERENCE_TYPE_LABEL[type] : type}
      </Badge>
      <div className="flex shrink-0 items-center gap-2">
        <CardViewedToggle
          viewed={viewed}
          disabled={disabled}
          onToggleViewed={onToggleViewed}
        />
        <ReferenceMergeCardMenu
          disabled={disabled || !restorable}
          onRestore={onRestore}
        />
      </div>
    </div>
  );
}

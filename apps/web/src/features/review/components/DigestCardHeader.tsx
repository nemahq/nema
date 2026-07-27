import type { DigestType } from "@nema-io/shared";

import type { ReviewDigest } from "@web/features/review/types";

import { CardViewedToggle } from "./CardViewedToggle";
import { DigestCardMenu } from "./DigestCardMenu";
import { DigestSourceButton } from "./DigestSourceButton";
import { DigestTopicPicker } from "./DigestTopicPicker";
import { DigestTypePicker } from "./DigestTypePicker";

interface DigestCardHeaderProps {
  digestId: string;
  type: DigestType;
  baseTopics: ReviewDigest["topics"];
  disabled: boolean;
  viewed: boolean;
  sourceActive: boolean;
  onToggleViewed: () => void;
  onViewSource: () => void;
  onChangeType: (next: DigestType) => void;
  onRemove: () => void;
}

// 좌: 상시 노출 타입·Topic, 우: 원문 보기·읽음·메뉴. 이 헤더 자신은 편집값을
// 구독하지 않는다 — Topic이 바뀌어도 리렌더는 DigestTopicPicker 안에서 끝나야 한다.
export function DigestCardHeader({
  digestId,
  type,
  baseTopics,
  disabled,
  viewed,
  sourceActive,
  onToggleViewed,
  onViewSource,
  onChangeType,
  onRemove,
}: DigestCardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* 상시 노출, Topic 왼쪽 고정 슬롯 — 가변폭 텍스트(Topic) 뒤에 붙으면
            지터가 생겨서 앞에 둔다. */}
        <DigestTypePicker
          type={type}
          disabled={disabled}
          onChangeType={onChangeType}
        />
        <DigestTopicPicker
          digestId={digestId}
          baseTopics={baseTopics}
          disabled={disabled}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <DigestSourceButton
          active={sourceActive}
          disabled={disabled}
          onClick={onViewSource}
        />
        <CardViewedToggle
          viewed={viewed}
          disabled={disabled}
          onToggleViewed={onToggleViewed}
        />
        <DigestCardMenu disabled={disabled} onRemove={onRemove} />
      </div>
    </div>
  );
}

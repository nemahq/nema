import type { ReferenceType } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";

import { CardViewedToggle } from "./CardViewedToggle";
import { ReferenceCardMenu } from "./ReferenceCardMenu";
import { ReferenceTypePicker } from "./ReferenceTypePicker";

interface ReferenceCardHeaderProps {
  referenceKey: string;
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
  referenceKey,
  type,
  disabled,
  viewed,
  onToggleViewed,
  onChangeType,
  onRemove,
}: ReferenceCardHeaderProps) {
  const { t } = useTranslation();
  const viewedFieldId = `reference-${referenceKey}-viewed`;

  return (
    <div className="flex items-center justify-between gap-2">
      <ReferenceTypePicker
        type={type}
        disabled={disabled}
        onChangeType={onChangeType}
      />
      <div className="flex shrink-0 items-center gap-2">
        <CardViewedToggle
          fieldId={viewedFieldId}
          label={t("review.reference_viewed_action")}
          viewed={viewed}
          disabled={disabled}
          onToggleViewed={onToggleViewed}
        />
        <ReferenceCardMenu disabled={disabled} onRemove={onRemove} />
      </div>
    </div>
  );
}

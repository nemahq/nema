import { REFERENCE_TYPES, type ReferenceType } from "@nema-io/shared";
import {
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { Check } from "@nema-io/weave/icons";

import { REFERENCE_TYPE_LABEL } from "@web/features/review/constants";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceTypePickerProps {
  type: ReferenceType;
  disabled: boolean;
  onChangeType: (next: ReferenceType) => void;
}

// DigestTypePicker와 같은 자리·같은 패턴(상시 노출 Chip, 클릭 시 드롭다운)이지만
// 두 가지가 다르다. (1) 확인 모달 없음 — 타입이 바뀌어도 필드 구조(설명 하나)가
// 그대로라 초기화될 내용이 없다. (2) 색 없이 outline — 타입이 필드 구조를 안
// 바꾸는 데다, Reference는 페이지 위계상 Digest보다 낮은 무게(부가·파생 콘텐츠)를
// 가져야 해서 색으로 Digest와 경쟁하면 안 된다. outline은 이 카드 계열에서 이미
// "존재감을 낮추는 톤"으로 쓰인다(DigestTopicPicker의 빈 상태 "+" 트리거).
export function ReferenceTypePicker({
  type,
  disabled,
  onChangeType,
}: ReferenceTypePickerProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Chip
          variant="outline"
          disabled={disabled}
          aria-label={t("review.reference_type_change_action")}
        >
          {REFERENCE_TYPE_LABEL[type]}
        </Chip>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" width={140}>
        {REFERENCE_TYPES.map((candidate) => (
          <DropdownMenuItem
            key={candidate}
            className="pr-8"
            onClick={() => onChangeType(candidate)}
          >
            {REFERENCE_TYPE_LABEL[candidate]}
            {candidate === type && (
              <span className="absolute right-2 flex size-3.5 items-center justify-center">
                <Check className="size-4" />
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

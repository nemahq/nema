import { DIGEST_TYPES } from "@nema-io/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import {
  DIGEST_TYPE_LABEL,
  isDigestType,
} from "@web/features/review/constants";
import type { ReviewDigest } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

interface DigestTypeSelectProps {
  bodyType: ReviewDigest["body"]["type"];
  disabled: boolean;
  onChange: (body: ReviewDigest["body"]) => void;
}

export function DigestTypeSelect({
  bodyType,
  disabled,
  onChange,
}: DigestTypeSelectProps) {
  const { t } = useTranslation();

  // 타입을 바꾸면 새 타입의 빈 body로 갈아끼운다 — 이전 타입 전용 필드는 판별자가
  // 달라 그대로 버려진다(review-flow.md "타입 변경 시 필드 초기화").
  function handleChange(type: string) {
    if (isDigestType(type)) {
      onChange({ type });
    }
  }

  return (
    <Select value={bodyType} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        aria-label={t("review.digest_type_label")}
        className="h-8 w-28 text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DIGEST_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {DIGEST_TYPE_LABEL[type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

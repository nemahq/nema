import { REFERENCE_BODY_MAX_LENGTH } from "@nema-io/shared";
import { Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

import { DigestTextField } from "./DigestTextField";

interface ReferenceBodyFieldProps {
  body: string;
  disabled: boolean;
  onChange: (body: string) => void;
}

// 신규 후보와 병합 후보가 공유하는 유일한 편집 필드 — 신규는 "새로 만들 설명",
// 병합은 "기존 설명을 어떻게 고칠지"라 뜻은 다르지만, 사용자가 보는 라벨·제약·
// 입력 모양이 같아야 두 카드가 한 목록에서 같은 것으로 읽힌다.
export function ReferenceBodyField({
  body,
  disabled,
  onChange,
}: ReferenceBodyFieldProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <Text as="span" size="sm" weight="medium" color="tertiary">
        {t("review.reference_body_label")}
      </Text>
      <DigestTextField
        text={body}
        disabled={disabled}
        maxLength={REFERENCE_BODY_MAX_LENGTH}
        placeholder={t("review.reference_body_placeholder")}
        onChange={onChange}
      />
    </div>
  );
}

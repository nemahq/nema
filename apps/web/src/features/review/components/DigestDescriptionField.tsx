import { DIGEST_DESCRIPTION_MAX_LENGTH } from "@nema-io/shared";
import { cn } from "@nema-io/weave";

import { DIGEST_DESCRIPTION_FIELD_CLASS } from "@web/features/review/digestFieldTypography";
import { useDraftField } from "@web/features/review/hooks/useDraftField";
import { useTranslation } from "@web/lib/tolgee";

import { InvisibleTextarea } from "./InvisibleTextarea";
import { useReviewDraftContext } from "./ReviewDraftProvider";

interface DigestDescriptionFieldProps {
  digestId: string;
  description: string;
  disabled: boolean;
}

// 크기·색은 weave Text(size="sm" color="tertiary")를 흉내내 구조화 필드(판단 대상,
// fg-primary)보다 한 단계 낮은 티어를 유지한다. placeholder는 본문 필드의 질문형이
// 아니라 명사형 — 제목 바로 아래 줄이라 훑을 때 읽을 텍스트를 늘리지 않는 게 낫다.
export function DigestDescriptionField({
  digestId,
  description,
  disabled,
}: DigestDescriptionFieldProps) {
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();
  const field = useDraftField(description, (next) =>
    dispatch({
      type: "digest/setDescription",
      id: digestId,
      description: next,
    }),
  );

  return (
    <InvisibleTextarea
      value={field.value}
      disabled={disabled}
      maxLength={DIGEST_DESCRIPTION_MAX_LENGTH}
      placeholder={t("review.digest_description_placeholder")}
      onChange={field.setValue}
      onBlur={field.commitNow}
      className={cn("-mt-1", DIGEST_DESCRIPTION_FIELD_CLASS)}
    />
  );
}

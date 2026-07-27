import { DIGEST_TITLE_MAX_LENGTH } from "@nema-io/shared";

import { useDraftField } from "@web/features/review/hooks/useDraftField";
import { useTranslation } from "@web/lib/tolgee";

import { InvisibleTextarea } from "./InvisibleTextarea";
import { useReviewDraftContext } from "./ReviewDraftProvider";

interface DigestTitleFieldProps {
  digestId: string;
  title: string;
  disabled: boolean;
}

// placeholder를 포커스와 무관하게 상시 노출하는 건 본문 필드와 다른 점이다 —
// 카드당 한 번뿐이라 반복해 읽힐 일이 없고, 훑을 때도 "비어 있다"는 신호 자체가
// 필요하다.
export function DigestTitleField({
  digestId,
  title,
  disabled,
}: DigestTitleFieldProps) {
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();
  const field = useDraftField(title, (next) =>
    dispatch({ type: "digest/setTitle", id: digestId, title: next }),
  );

  return (
    <InvisibleTextarea
      value={field.value}
      disabled={disabled}
      maxLength={DIGEST_TITLE_MAX_LENGTH}
      placeholder={t("intake.draft_untitled")}
      onChange={field.setValue}
      onBlur={field.commitNow}
      className="text-[20px] font-semibold leading-[1.4]"
    />
  );
}

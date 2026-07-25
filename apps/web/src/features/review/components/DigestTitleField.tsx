import { DIGEST_TITLE_MAX_LENGTH } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";

import { useEditing } from "./EditingProvider";
import { InvisibleTextarea } from "./InvisibleTextarea";

interface DigestTitleFieldProps {
  digestIndex: number;
  baseTitle: string;
  disabled: boolean;
}

// placeholder를 포커스와 무관하게 상시 노출하는 건 본문 필드와 다른 점이다 —
// 카드당 한 번뿐이라 반복해 읽힐 일이 없고, 훑을 때도 "비어 있다"는 신호 자체가
// 필요하다.
export function DigestTitleField({
  digestIndex,
  baseTitle,
  disabled,
}: DigestTitleFieldProps) {
  const { t } = useTranslation();
  const dispatch = useEditing((state) => state.dispatch);
  const title = useEditing(
    (state) => state.overrides.titleOverrides.get(digestIndex) ?? baseTitle,
  );

  return (
    <InvisibleTextarea
      value={title}
      disabled={disabled}
      maxLength={DIGEST_TITLE_MAX_LENGTH}
      placeholder={t("intake.draft_untitled")}
      onChange={(next) =>
        dispatch({ type: "digest/setTitle", index: digestIndex, title: next })
      }
      className="text-[20px] font-semibold leading-[1.4]"
    />
  );
}

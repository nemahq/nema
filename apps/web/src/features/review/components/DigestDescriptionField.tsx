import { DIGEST_DESCRIPTION_MAX_LENGTH } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";

import { useEditing } from "./EditingProvider";
import { InvisibleTextarea } from "./InvisibleTextarea";

interface DigestDescriptionFieldProps {
  digestIndex: number;
  baseDescription: string;
  disabled: boolean;
}

// 크기·색은 weave Text(size="sm" color="tertiary")를 흉내내 구조화 필드(판단 대상,
// fg-primary)보다 한 단계 낮은 티어를 유지한다. placeholder는 본문 필드의 질문형이
// 아니라 명사형 — 제목 바로 아래 줄이라 훑을 때 읽을 텍스트를 늘리지 않는 게 낫다.
export function DigestDescriptionField({
  digestIndex,
  baseDescription,
  disabled,
}: DigestDescriptionFieldProps) {
  const { t } = useTranslation();
  const dispatch = useEditing((state) => state.dispatch);
  const description = useEditing(
    (state) =>
      state.overrides.descriptionOverrides.get(digestIndex) ?? baseDescription,
  );

  return (
    <InvisibleTextarea
      value={description}
      disabled={disabled}
      maxLength={DIGEST_DESCRIPTION_MAX_LENGTH}
      placeholder={t("review.digest_description_placeholder")}
      onChange={(next) =>
        dispatch({
          type: "digest/setDescription",
          index: digestIndex,
          description: next,
        })
      }
      className="-mt-1 text-[14px] leading-[1.5] text-fg-tertiary"
    />
  );
}

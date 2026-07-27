import { useState } from "react";

import { REFERENCE_TITLE_MAX_LENGTH } from "@nema-io/shared";

import type { ReviewNewReference } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { useEditing } from "./EditingProvider";
import { InvisibleTextarea } from "./InvisibleTextarea";
import { NewReferenceIndicator } from "./NewReferenceIndicator";
import { ReferenceBodyField } from "./ReferenceBodyField";
import { ReferenceCardHeader } from "./ReferenceCardHeader";

interface ReferenceCandidateCardProps {
  baseReference: ReviewNewReference;
  disabled: boolean;
}

// 신규 후보만 다룬다 — diff(기존 설명·바뀔 설명) 케이스는 ReferenceMergeCard가
// 맡는다. 외부 링크는 Digest 쪽도 아직 없어 이번 라운드는 같이 뺀다.
// 편집값은 DigestCandidateCard와 같은 이유로 이 카드가 자기 key만 구독한다 —
// 목록이 들면 한 카드에 타이핑할 때마다 형제 카드가 전부 다시 그려진다.
export function ReferenceCandidateCard({
  baseReference,
  disabled,
}: ReferenceCandidateCardProps) {
  // Digest와 같은 이유로 화면 전용 상태 — 서버로도 부모로도 안 올린다.
  const [viewed, setViewed] = useState(false);
  const { t } = useTranslation();
  const dispatch = useEditing((state) => state.dispatch);
  const reference = useEditing(
    (state) =>
      state.overrides.referenceOverrides.get(baseReference.id) ?? baseReference,
  );

  function update(patch: Partial<ReviewNewReference>) {
    dispatch({
      type: "reference/set",
      id: reference.id,
      reference: { ...reference, ...patch },
    });
  }

  return (
    <CandidateCardFrame
      viewed={viewed}
      className="relative"
      wash={
        <>
          <NewReferenceIndicator />
          <ReferenceCardHeader
            type={reference.type}
            disabled={disabled}
            viewed={viewed}
            onToggleViewed={() => setViewed((current) => !current)}
            onChangeType={(type) => update({ type })}
            onRemove={() =>
              dispatch({ type: "reference/remove", id: reference.id })
            }
          />
          <InvisibleTextarea
            value={reference.title}
            disabled={disabled}
            maxLength={REFERENCE_TITLE_MAX_LENGTH}
            placeholder={t("review.reference_title_placeholder")}
            onChange={(title) => update({ title })}
            className="text-[20px] font-semibold leading-[1.4]"
          />
        </>
      }
    >
      <div className="mt-2 pl-2">
        <ReferenceBodyField
          body={reference.body}
          disabled={disabled}
          onChange={(body) => update({ body })}
        />
      </div>
    </CandidateCardFrame>
  );
}

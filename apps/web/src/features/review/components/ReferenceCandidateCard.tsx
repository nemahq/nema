import { useState } from "react";

import { REFERENCE_TITLE_MAX_LENGTH } from "@nema-io/shared";

import { useDraftField } from "@web/features/review/hooks/useDraftField";
import type { ReviewNewReference } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { InvisibleTextarea } from "./InvisibleTextarea";
import { ReferenceBodyField } from "./ReferenceBodyField";
import { ReferenceCardHeader } from "./ReferenceCardHeader";
import { useReviewDraftContext } from "./ReviewDraftProvider";

interface ReferenceCandidateCardProps {
  reference: ReviewNewReference;
  disabled: boolean;
}

// 신규 후보만 다룬다 — diff(기존 설명·바뀔 설명) 케이스는 ReferenceMergeCard가
// 맡는다. 외부 링크는 Digest 쪽도 아직 없어 이번 라운드는 같이 뺀다.
export function ReferenceCandidateCard({
  reference,
  disabled,
}: ReferenceCandidateCardProps) {
  // Digest와 같은 이유로 화면 전용 상태 — 서버로도 부모로도 안 올린다.
  const [viewed, setViewed] = useState(false);
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();
  const titleField = useDraftField(reference.title, (title) =>
    dispatch({ type: "reference/setTitle", id: reference.id, title }),
  );
  const bodyField = useDraftField(reference.body, (body) =>
    dispatch({ type: "reference/setBody", id: reference.id, body }),
  );

  return (
    <CandidateCardFrame
      viewed={viewed}
      className="relative"
      wash={
        <>
          <ReferenceCardHeader
            type={reference.type}
            disabled={disabled}
            viewed={viewed}
            onToggleViewed={() => setViewed((current) => !current)}
            onChangeType={(referenceType) =>
              dispatch({
                type: "reference/setType",
                id: reference.id,
                referenceType,
              })
            }
            onRemove={() =>
              dispatch({ type: "reference/remove", id: reference.id })
            }
          />
          <InvisibleTextarea
            value={titleField.value}
            disabled={disabled}
            maxLength={REFERENCE_TITLE_MAX_LENGTH}
            placeholder={t("review.reference_title_placeholder")}
            onChange={titleField.setValue}
            onBlur={titleField.commitNow}
            className="text-[20px] font-semibold leading-[1.4]"
          />
        </>
      }
    >
      <div className="mt-2 pl-2">
        <ReferenceBodyField
          body={bodyField.value}
          disabled={disabled}
          onChange={bodyField.setValue}
          onBlur={bodyField.commitNow}
        />
      </div>
    </CandidateCardFrame>
  );
}

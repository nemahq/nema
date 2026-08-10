import { useState } from "react";

import { Text } from "@nema-io/weave";

import { useDraftField } from "@web/features/review/hooks/useDraftField";
import type { ReviewCitedReference } from "@web/features/review/types";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { ReferenceBodyField } from "./ReferenceBodyField";
import { ReferenceMergeCardHeader } from "./ReferenceMergeCardHeader";
import { ReferenceMergeDiffDisclosure } from "./ReferenceMergeDiffDisclosure";
import { useReviewDraftContext } from "./ReviewDraftProvider";

interface ReferenceMergeCardProps {
  reference: ReviewCitedReference;
  disabled: boolean;
}

// "원래대로"는 RPC의 before===after no-op으로 병합을 거부하는 것이라 메뉴 뒤에 둔다.
export function ReferenceMergeCard({
  reference,
  disabled,
}: ReferenceMergeCardProps) {
  const [viewed, setViewed] = useState(false);
  const { dispatch } = useReviewDraftContext();
  // diff는 이 화면에 들어온 시점의 엔진 제안과 원본을 비교한다 — 병합 설명은 이제
  // 초안 안에서 직접 고쳐지므로, 초안의 현재 값을 기준으로 삼으면 사용자가 고칠
  // 때마다 "뭐가 AI 제안이었는지"가 흔들린다.
  const [engineMergeNote] = useState(
    () => reference.mergeNote ?? reference.body,
  );
  const mergeNoteField = useDraftField(
    reference.mergeNote ?? reference.body,
    (mergeNote) =>
      dispatch({
        type: "citedReference/setMergeNote",
        id: reference.id,
        mergeNote,
      }),
  );

  return (
    <CandidateCardFrame
      viewed={viewed}
      wash={
        <>
          <ReferenceMergeCardHeader
            type={reference.type}
            disabled={disabled}
            viewed={viewed}
            restorable={mergeNoteField.value !== reference.body}
            onToggleViewed={() => setViewed((current) => !current)}
            onRestore={() =>
              dispatch({
                type: "citedReference/setMergeNote",
                id: reference.id,
                mergeNote: reference.body,
              })
            }
          />
          <Text
            size="xl"
            weight="semibold"
            title={reference.title}
            className="min-w-0 truncate"
          >
            {reference.title}
          </Text>
        </>
      }
    >
      <div className="mt-2 flex flex-col gap-3 pl-2">
        <ReferenceBodyField
          body={mergeNoteField.value}
          disabled={disabled}
          onChange={mergeNoteField.setValue}
          onBlur={mergeNoteField.commitNow}
        />
        <ReferenceMergeDiffDisclosure
          original={reference.body}
          revised={engineMergeNote}
        />
      </div>
    </CandidateCardFrame>
  );
}

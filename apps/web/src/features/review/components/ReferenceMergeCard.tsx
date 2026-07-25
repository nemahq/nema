import { useState } from "react";

import { Text } from "@nema-io/weave";

import type { ReviewCitedReference } from "@web/features/review/types";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { useEditing } from "./EditingProvider";
import { ReferenceBodyField } from "./ReferenceBodyField";
import { ReferenceMergeCardHeader } from "./ReferenceMergeCardHeader";
import { ReferenceMergeDiffDisclosure } from "./ReferenceMergeDiffDisclosure";

interface ReferenceMergeCardProps {
  reference: ReviewCitedReference;
  disabled: boolean;
}

// "원래대로"는 RPC의 before===after no-op으로 병합을 거부하는 것이라 메뉴 뒤에 둔다.
// diff는 엔진의 원래 제안(reference.mergeNote)과 body를 비교한다 — 편집 필드의
// 실시간 값과 비교하면 사용자가 고칠 때마다 "뭐가 AI 제안이었는지"가 흔들린다.
export function ReferenceMergeCard({
  reference,
  disabled,
}: ReferenceMergeCardProps) {
  const [viewed, setViewed] = useState(false);
  const dispatch = useEditing((state) => state.dispatch);
  const aiProposedNote = reference.mergeNote ?? reference.body;
  const mergeNote = useEditing(
    (state) =>
      state.overrides.mergeNoteOverrides.get(reference.id) ?? aiProposedNote,
  );

  function setMergeNote(next: string) {
    dispatch({
      type: "reference/setMergeNote",
      referenceId: reference.id,
      mergeNote: next,
    });
  }

  return (
    <CandidateCardFrame
      viewed={viewed}
      wash={
        <>
          <ReferenceMergeCardHeader
            type={reference.type}
            disabled={disabled}
            viewed={viewed}
            restorable={mergeNote !== reference.body}
            onToggleViewed={() => setViewed((current) => !current)}
            onRestore={() => setMergeNote(reference.body)}
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
          body={mergeNote}
          disabled={disabled}
          onChange={setMergeNote}
        />
        <ReferenceMergeDiffDisclosure
          original={reference.body}
          revised={aiProposedNote}
        />
      </div>
    </CandidateCardFrame>
  );
}

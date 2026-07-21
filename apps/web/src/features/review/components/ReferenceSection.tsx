import { Text } from "@nema-io/weave";

import { buildMergeRows } from "@web/features/review/referenceMerge";
import type {
  ReviewCitedReference,
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { useEditing } from "./EditingProvider";
import { ReferenceCandidateCard } from "./ReferenceCandidateCard";
import { ReferenceMergeCard } from "./ReferenceMergeCard";

interface ReferenceSectionProps {
  digests: ReviewDigest[];
  newReferences: ReviewNewReference[];
  citedReferences: ReviewCitedReference[];
  disabled: boolean;
}

// 병합 행은 살아남은 Digest가 무엇을 인용하는지에 달려 있어(referenceMerge.ts) Digest
// 삭제까지 함께 구독한다 — 마지막으로 인용하던 후보가 빠지면 병합 행도 사라져야 한다.
//
// Digest 쪽과 달리 카드가 memo도 아니고 콜백도 여기서 만들어 넘긴다. Reference는 행
// 파생이 Digest 삭제와 얽혀 있어 카드가 자기 몫만 구독하기 어렵고, 후보 수도 적어
// 아직 값이 없다고 봤다. 후보가 늘거나 편집 필드가 붙으면 Digest 쪽 형태로 옮긴다.
export function ReferenceSection({
  digests,
  newReferences,
  citedReferences,
  disabled,
}: ReferenceSectionProps) {
  const { t } = useTranslation();
  const dispatch = useEditing((state) => state.dispatch);
  const removedDigestIndexes = useEditing(
    (state) => state.overrides.removedDigestIndexes,
  );
  const removedReferenceKeys = useEditing(
    (state) => state.overrides.removedReferenceKeys,
  );
  const referenceOverrides = useEditing(
    (state) => state.overrides.referenceOverrides,
  );
  const mergeNoteOverrides = useEditing(
    (state) => state.overrides.mergeNoteOverrides,
  );

  const referenceRows = newReferences
    .filter((reference) => !removedReferenceKeys.has(reference.key))
    .map((reference) => referenceOverrides.get(reference.key) ?? reference);
  const mergeRows = buildMergeRows({
    citedReferences,
    citedReferenceIds: new Set(
      digests
        .filter((_, index) => !removedDigestIndexes.has(index))
        .flatMap((digest) => digest.referenceIds),
    ),
    mergeNoteOverrides,
  });

  if (referenceRows.length + mergeRows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <Text as="h2" size="sm" bold color="secondary">
        {t("review.reference_section_title", {
          count: referenceRows.length + mergeRows.length,
        })}
      </Text>
      {referenceRows.map((reference) => (
        <ReferenceCandidateCard
          key={reference.key}
          reference={reference}
          disabled={disabled}
          onChange={(next) =>
            dispatch({
              type: "reference/set",
              key: reference.key,
              reference: next,
            })
          }
          onRemove={() =>
            dispatch({ type: "reference/remove", key: reference.key })
          }
        />
      ))}
      {mergeRows.map(({ reference, mergeNote }) => (
        <ReferenceMergeCard
          key={reference.id}
          reference={reference}
          mergeNote={mergeNote}
          disabled={disabled}
          onMergeNoteChange={(next) =>
            dispatch({
              type: "reference/setMergeNote",
              referenceId: reference.id,
              mergeNote: next,
            })
          }
        />
      ))}
    </div>
  );
}

import { Text } from "@nema-io/weave";

import { selectMergeCandidates } from "@web/features/review/referenceMerge";
import type {
  ReviewCitedReference,
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { ReferenceCandidateCard } from "./ReferenceCandidateCard";
import { ReferenceMergeCard } from "./ReferenceMergeCard";

interface ReferenceSectionProps {
  digests: ReviewDigest[];
  newReferences: ReviewNewReference[];
  citedReferences: ReviewCitedReference[];
  disabled: boolean;
}

// 병합 후보는 살아남은 Digest가 무엇을 인용하는지에 달려 있어(referenceMerge.ts)
// Digest 목록도 같이 받는다 — 마지막으로 인용하던 후보가 빠지면 병합 후보도
// 사라져야 한다.
export function ReferenceSection({
  digests,
  newReferences,
  citedReferences,
  disabled,
}: ReferenceSectionProps) {
  const { t } = useTranslation();

  const mergeCandidates = selectMergeCandidates({
    citedReferences,
    citedReferenceIds: new Set(
      digests.flatMap((digest) => digest.referenceIds),
    ),
  });

  if (newReferences.length + mergeCandidates.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <Text as="h2" size="sm" weight="semibold" color="secondary">
        {t("review.reference_section_title", {
          count: newReferences.length + mergeCandidates.length,
        })}
      </Text>
      {/* DigestCandidateList와 같은 이유로 라벨과 별도 wrapper — 카드들을 gap 없는
          안쪽 div로 묶어야 카드 간 간격이 부모 gap-3와 안 겹치고 각 카드 자신의
          pb 하나로만 정해진다(겹치면 카드 사이만 이중으로 벌어짐, 실측 확인됨). */}
      <div className="flex flex-col">
        {newReferences.map((reference) => (
          <ReferenceCandidateCard
            key={reference.id}
            reference={reference}
            disabled={disabled}
          />
        ))}
        {mergeCandidates.map((reference) => (
          <ReferenceMergeCard
            key={reference.id}
            reference={reference}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

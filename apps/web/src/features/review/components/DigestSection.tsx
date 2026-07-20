import type {
  ReviewCitedReference,
  ReviewDigest,
} from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { DigestCandidateCard } from "./DigestCandidateCard";
import { useReviewEditing } from "./ReviewEditingProvider";

interface DigestSectionProps {
  spaceId: string;
  digests: ReviewDigest[];
  citedReferences: ReviewCitedReference[];
  disabled: boolean;
}

// 삭제 집합만 구독한다 — 카드 안의 제목·본문·라벨을 아무리 고쳐도 이 selector 결과가
// 그대로라 섹션은 리렌더되지 않고, 후보가 실제로 빠질 때만 다시 그린다.
export function DigestSection({
  spaceId,
  digests,
  citedReferences,
  disabled,
}: DigestSectionProps) {
  const { t } = useTranslation();
  const removedIndexes = useReviewEditing(
    (state) => state.overrides.removedDigestIndexes,
  );
  const visible = digests
    .map((digest, index) => ({ digest, index }))
    .filter(({ index }) => !removedIndexes.has(index));

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-fg-secondary">
        {t("review.digest_section_title", { count: visible.length })}
      </h2>
      {visible.map(({ digest, index }) => (
        <DigestCandidateCard
          key={index}
          index={index}
          spaceId={spaceId}
          digest={digest}
          citedReferences={citedReferences}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

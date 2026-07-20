import type {
  ReviewCitedReference,
  ReviewDigest,
} from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { DigestCandidateCard } from "./DigestCandidateCard";
import { useEditing } from "./EditingProvider";

interface DigestSectionProps {
  spaceId: string;
  digests: ReviewDigest[];
  citedReferences: ReviewCitedReference[];
  disabled: boolean;
}

// 삭제 집합만 구독한다 — 카드 안의 제목·본문·라벨을 고쳐도 이 selector 결과가 그대로다.
// 다시 그리는 건 후보가 빠질 때와 편집 잠금이 바뀔 때(부모가 disabled를 넘긴다)뿐이고,
// 그때 카드가 버티는 건 DigestCandidateCard의 memo 몫이다.
export function DigestSection({
  spaceId,
  digests,
  citedReferences,
  disabled,
}: DigestSectionProps) {
  const { t } = useTranslation();
  const removedIndexes = useEditing(
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

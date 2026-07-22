import type { ReviewDigest } from "@web/features/review/types";

import { DigestCandidateCard } from "./DigestCandidateCard";

interface DigestCandidateListProps {
  digests: ReviewDigest[];
  disabled: boolean;
  activeSourceIndex: number | null;
  onViewSource: (digestIndex: number) => void;
}

// 카드 사이 구분선을 두지 않는다 — 헤더 워시가 이미 "새 카드 시작"을 알려서 선까지
// 얹으면 같은 신호가 겹친다. 위 여백은 여기 pt-4 하나로 고정하고 카드는 pb만 가져서,
// 카드가 접혀도 페이지 헤더와의 간격은 흔들리지 않는다.
export function DigestCandidateList({
  digests,
  disabled,
  activeSourceIndex,
  onViewSource,
}: DigestCandidateListProps) {
  return (
    <div className="flex flex-col pt-4">
      {digests.map((digest, index) => (
        <DigestCandidateCard
          key={index}
          digestIndex={index}
          digest={digest}
          disabled={disabled}
          sourceActive={activeSourceIndex === index}
          onViewSource={() => onViewSource(index)}
        />
      ))}
    </div>
  );
}

import { Text } from "@nema-io/weave";

import type { ReviewDraft } from "@web/features/review/reviewDraft";
import type { ReviewDigest } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { DigestCandidateCard } from "./DigestCandidateCard";

interface DigestCandidateListProps {
  digests: ReviewDigest[];
  labelDraft: ReviewDraft["labelDraft"];
  disabled: boolean;
  activeSourceDigestId: string | null;
  onViewSource: (digestId: string) => void;
}

// 카드 사이 구분선을 두지 않는다 — 헤더 워시가 이미 "새 카드 시작"을 알려서 선까지
// 얹으면 같은 신호가 겹친다. 라벨-카드 간격은 부모 gap-3 하나로 고정하고 카드는
// pb만 가져서, 카드가 접혀도 라벨과의 간격은 흔들리지 않는다. 후보를 전부 지우면
// 도달 가능한 상태라(hasCandidates가 이때 확정을 막는다) ReferenceSection과 같은
// "없으면 생략" 가드를 둔다.
export function DigestCandidateList({
  digests,
  labelDraft,
  disabled,
  activeSourceDigestId,
  onViewSource,
}: DigestCandidateListProps) {
  const { t } = useTranslation();

  if (digests.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      <Text as="h2" size="sm" weight="semibold" color="secondary">
        {t("review.digest_section_title", { count: digests.length })}
      </Text>
      <div className="flex flex-col">
        {digests.map((digest) => (
          <DigestCandidateCard
            key={digest.id}
            digest={digest}
            labelDraft={labelDraft}
            disabled={disabled}
            sourceActive={activeSourceDigestId === digest.id}
            onViewSource={() => onViewSource(digest.id)}
          />
        ))}
      </div>
    </div>
  );
}

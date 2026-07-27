import { Text } from "@nema-io/weave";

import type { ReviewDigest } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { DigestCandidateCard } from "./DigestCandidateCard";
import { useEditing } from "./EditingProvider";

interface DigestCandidateListProps {
  digests: ReviewDigest[];
  disabled: boolean;
  activeSourceIndex: number | null;
  onViewSource: (digestIndex: number) => void;
}

// 카드 사이 구분선을 두지 않는다 — 헤더 워시가 이미 "새 카드 시작"을 알려서 선까지
// 얹으면 같은 신호가 겹친다. 라벨-카드 간격은 부모 gap-3 하나로 고정하고 카드는
// pb만 가져서, 카드가 접혀도 라벨과의 간격은 흔들리지 않는다. 후보를 전부 지우면
// 도달 가능한 상태라(hasCandidates가 이때 확정을 막는다) ReferenceSection과 같은
// "없으면 생략" 가드를 둔다.
export function DigestCandidateList({
  digests,
  disabled,
  activeSourceIndex,
  onViewSource,
}: DigestCandidateListProps) {
  const { t } = useTranslation();
  const removedIds = useEditing((state) => state.overrides.removedDigestIds);
  // 삭제는 서버로 바로 안 나가고 확정 시 반영되는 오버라이드라, 화면에서 빼는 건
  // 이 목록의 몫이다. digest.id로 걸러내고, index는 원문 하이라이트 탭 식별용으로
  // 원래 배열 위치를 그대로 유지한다.
  const visible = digests
    .map((digest, index) => ({ digest, index }))
    .filter(({ digest }) => !removedIds.has(digest.id));

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      <Text as="h2" size="sm" weight="semibold" color="secondary">
        {t("review.digest_section_title", { count: visible.length })}
      </Text>
      <div className="flex flex-col">
        {visible.map(({ digest, index }) => (
          <DigestCandidateCard
            key={digest.id}
            digestId={digest.id}
            digest={digest}
            disabled={disabled}
            sourceActive={activeSourceIndex === index}
            onViewSource={() => onViewSource(index)}
          />
        ))}
      </div>
    </div>
  );
}

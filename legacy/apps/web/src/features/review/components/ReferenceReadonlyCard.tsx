import { Badge, Text } from "@nema-io/weave";

import { REFERENCE_TYPE_LABEL_KEY } from "@web/features/review/constants";
import type { ChangesetReferenceSnapshot } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { CandidateCardFrame } from "./CandidateCardFrame";

interface ReferenceReadonlyCardProps {
  reference: ChangesetReferenceSnapshot;
}

// Changeset 상세(closed)가 얼려서 보여주는 Reference 카드 — DigestReadonlyCard와
// 같은 자리의 읽기 전용 컴포넌트다. 신규·병합 구분 없이 이 하나로 같이 쓴다 —
// 신규는 create 스냅샷, 병합은 병합 결과 스냅샷이라 화면에 보여줄 모양(타입 배지+
// 제목+설명)이 이미 같다(diff는 확정 전 초안에서만 의미 있다, surface-inventory.md
// "확정 후엔 diff가 사라지고 최종 병합된 설명 하나만 남는다").
export function ReferenceReadonlyCard({
  reference,
}: ReferenceReadonlyCardProps) {
  const { t } = useTranslation();

  return (
    <CandidateCardFrame
      viewed={false}
      wash={
        <>
          <Badge variant="outline">
            {t(REFERENCE_TYPE_LABEL_KEY[reference.type])}
          </Badge>
          <Text as="span" size="xl" weight="semibold" className="truncate">
            {reference.title}
          </Text>
        </>
      }
    >
      <div className="mt-2 pl-2">
        <Text as="p" size="base" className="whitespace-pre-wrap">
          {reference.body}
        </Text>
      </div>
    </CandidateCardFrame>
  );
}

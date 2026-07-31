import type {
  ArchivedBadgeCause,
  DigestBodyFieldKey,
} from "@web/features/review/constants";
import type { DigestDetailSnapshot } from "@web/features/review/types";

import { DigestReadonlyCard } from "./DigestReadonlyCard";
import { DigestSourceButton } from "./DigestSourceButton";

interface DigestReadonlyCardWithSourceProps {
  digest: DigestDetailSnapshot;
  // 탭 열기·닫기·활성 판정은 호출부가 갖는다(controlled) — DigestReadonlyCardList처럼
  // 여러 카드가 같은 Source(탭 하나)를 공유하는 소비처는 activeTabId 하나만으론
  // "어느 카드가 그 탭을 열었는지" 구분이 안 돼, 그 판정 자체를 부모가 해야 한다.
  // RelationJudgmentCard·DigestCandidateCard와 같은 결의 controlled 패턴.
  sourceActive: boolean;
  onViewSource: () => void;
  archivedBadge?: ArchivedBadgeCause;
  highlightedFieldKey?: DigestBodyFieldKey;
  highlightedFieldIndex?: number;
}

// DigestReadonlyCard(판정 액션을 모르는 순수 콘텐츠 컴포넌트) 밖에서 "원문 보기"를
// 얹는 자리 — RelationJudgmentCard와 같은 원칙이지만, 거기는 절대배치 오버레이로
// 얹어도 안전한 반면(그 화면은 archived 배지가 없다) 여기는 카드 우상단에 배지가
// 뜰 수 있어 겹친다. 그래서 오버레이 대신 카드 옆 별도 컬럼에 나란히 둔다.
export function DigestReadonlyCardWithSource({
  digest,
  sourceActive,
  onViewSource,
  archivedBadge,
  highlightedFieldKey,
  highlightedFieldIndex,
}: DigestReadonlyCardWithSourceProps) {
  return (
    <div className="flex items-start gap-2">
      <DigestReadonlyCard
        digest={digest}
        archivedBadge={archivedBadge}
        highlightedFieldKey={highlightedFieldKey}
        highlightedFieldIndex={highlightedFieldIndex}
        className="min-w-0 flex-1"
      />
      <DigestSourceButton
        active={sourceActive}
        disabled={false}
        onClick={onViewSource}
      />
    </div>
  );
}

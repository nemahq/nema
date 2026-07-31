import type {
  ArchivedBadgeCause,
  DigestBodyFieldKey,
} from "@web/features/review/constants";
import type { DigestDetailSnapshot } from "@web/features/review/types";

import { useChangesetSidePanel } from "./ChangesetSidePanelProvider";
import { DigestReadonlyCard } from "./DigestReadonlyCard";
import { DigestSourceButton } from "./DigestSourceButton";
import { RelationJudgmentSourceTab } from "./RelationJudgmentSourceTab";

interface DigestReadonlyCardWithSourceProps {
  digest: DigestDetailSnapshot;
  // ingestion_applied는 여러 카드가 한 Source를 공유해 sourceId를 그대로 넘겨
  // 탭 하나를 같이 쓰지만, relation 비교 카드는 A·B가 서로 다른 Source일 수
  // 있어 statementId로 각자 독립된 탭을 연다(ConflictRelationJudgment와 같은 결).
  tabId: string;
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
  tabId,
  archivedBadge,
  highlightedFieldKey,
  highlightedFieldIndex,
}: DigestReadonlyCardWithSourceProps) {
  const { openTab, closeTab, activeTabId } = useChangesetSidePanel();

  function handleViewSource() {
    if (activeTabId === tabId) {
      closeTab(tabId);
      return;
    }
    openTab({
      id: tabId,
      label: digest.title,
      content: (
        <RelationJudgmentSourceTab
          sourceId={digest.sourceId}
          fallbackTitle={digest.title}
        />
      ),
    });
  }

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
        active={activeTabId === tabId}
        disabled={false}
        onClick={handleViewSource}
      />
    </div>
  );
}

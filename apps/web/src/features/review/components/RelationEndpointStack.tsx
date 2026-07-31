import type { ReactNode } from "react";

import type { ArchivedBadgeCause } from "@web/features/review/constants";
import { toHighlightedFieldKey } from "@web/features/review/digestBodyFieldValue";
import type { RelationEndpointDetailSnapshot } from "@web/features/review/types";

import { useChangesetSidePanel } from "./ChangesetSidePanelProvider";
import { DigestReadonlyCardWithSource } from "./DigestReadonlyCardWithSource";
import { RelationJudgmentSourceTab } from "./RelationJudgmentSourceTab";

interface RelationEndpointStackProps {
  // 위/아래 스택 순서일 뿐 승패를 뜻하지 않는다 — conflict의 from/to는 관계 엔진이
  // 감지 시점에 임의로 매긴 방향이라 승자가 항상 first인 게 아니다(승자는
  // resolve_conflict_relation의 별도 파라미터로 판정됨). duplicate만 first=keeper가
  // 보장된다(호출부가 keeper를 first로 넘김). 어느 쪽이 밀려났는지는 이 순서가
  // 아니라 각자의 archivedByChangeset으로 판정한다.
  first: RelationEndpointDetailSnapshot;
  second: RelationEndpointDetailSnapshot;
  // conflict/duplicate는 헤더 상태 배지+from·to 구도만으로 판정 결과라는 게
  // 드러나지만, confident는 사람 판정 카드와 모양이 완전히 같아 이 캡션이 없으면
  // "이게 자동 연결인지 사람이 고른 건지"를 구분할 수 없다.
  caption?: ReactNode;
  // first·second가 archivedByChangeset이면 보여줄 배지 문구 — 관계 종류(conflict=
  // replaced, duplicate=merged)마다 호출부가 고정값으로 넘긴다. null이면(confident
  // supports 등) archivedByChangeset이 true여도 배지를 안 띄운다.
  archivedBadgeCause: ArchivedBadgeCause | null;
}

// 관계 판정 화면의 A·B 비교 카드를 얼려서 보여주는 자리 — 나란히 2열이 아니라
// 위아래로 스택한다(surface-inventory.md "관계 판정 화면" 본문 레이아웃).
// relation_conflict_applied·relation_duplicate_applied·relation_confident_applied
// 셋이 전부 이 컴포넌트를 공유한다.
// archivedByChangeset일 때만 archivedBadgeCause를 실어 보낸다 — null(예: confident
// supports)이면 archivedByChangeset이 true여도 배지를 안 띄운다.
function archivedBadgeFor(
  endpoint: RelationEndpointDetailSnapshot,
  cause: ArchivedBadgeCause | null,
) {
  return endpoint.archivedByChangeset ? (cause ?? undefined) : undefined;
}

export function RelationEndpointStack({
  first,
  second,
  caption,
  archivedBadgeCause,
}: RelationEndpointStackProps) {
  const { openTab, closeTab, activeTabId } = useChangesetSidePanel();
  const firstTabId = `tab-source-${first.statementId}`;
  const secondTabId = `tab-source-${second.statementId}`;

  function handleViewSource(
    endpoint: RelationEndpointDetailSnapshot,
    tabId: string,
  ) {
    if (activeTabId === tabId) {
      closeTab(tabId);
      return;
    }
    openTab({
      id: tabId,
      label: endpoint.digest.title,
      content: (
        <RelationJudgmentSourceTab
          sourceId={endpoint.digest.sourceId}
          fallbackTitle={endpoint.digest.title}
        />
      ),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {caption}
      <div className="flex flex-col gap-4">
        <DigestReadonlyCardWithSource
          digest={first.digest}
          sourceActive={activeTabId === firstTabId}
          onViewSource={() => handleViewSource(first, firstTabId)}
          archivedBadge={archivedBadgeFor(first, archivedBadgeCause)}
          highlightedFieldKey={toHighlightedFieldKey(first.sourceField)}
          highlightedFieldIndex={first.sourceFieldIndex ?? undefined}
        />
        <DigestReadonlyCardWithSource
          digest={second.digest}
          sourceActive={activeTabId === secondTabId}
          onViewSource={() => handleViewSource(second, secondTabId)}
          archivedBadge={archivedBadgeFor(second, archivedBadgeCause)}
          highlightedFieldKey={toHighlightedFieldKey(second.sourceField)}
          highlightedFieldIndex={second.sourceFieldIndex ?? undefined}
        />
      </div>
    </div>
  );
}

import { useState } from "react";

import type { DigestDetailSnapshot } from "@web/features/review/types";

import { useChangesetSidePanel } from "./ChangesetSidePanelProvider";
import { DigestReadonlyCardWithSource } from "./DigestReadonlyCardWithSource";
import { RelationJudgmentSourceTab } from "./RelationJudgmentSourceTab";

interface DigestReadonlyCardListProps {
  digests: DigestDetailSnapshot[];
}

// 이 changeset이 만든 다이제스트는 전부 같은 Source에서 나와(ingestion changeset은
// sourceId 하나뿐) 탭 id도 하나뿐이다 — activeTabId만으론 어느 카드가 그 탭을
// 열었는지 구분이 안 돼(IngestionScreen과 같은 이유), 가장 최근에 누른 카드를
// 따로 들고 있어야 그 카드의 트리거만 활성화되고, 다른 카드를 눌렀을 때 탭이
// 닫히는 대신 그대로 포커스만 옮겨간다.
export function DigestReadonlyCardList({
  digests,
}: DigestReadonlyCardListProps) {
  const { openTab, closeTab, activeTabId } = useChangesetSidePanel();
  const [activeSourceDigestId, setActiveSourceDigestId] = useState<
    string | null
  >(null);

  function handleViewSource(digest: DigestDetailSnapshot) {
    const tabId = `tab-source-${digest.sourceId}`;
    if (activeTabId === tabId && activeSourceDigestId === digest.id) {
      closeTab(tabId);
      return;
    }
    setActiveSourceDigestId(digest.id);
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
    <div className="flex flex-col gap-4">
      {digests.map((digest) => {
        const tabId = `tab-source-${digest.sourceId}`;
        return (
          <DigestReadonlyCardWithSource
            key={digest.id}
            digest={digest}
            sourceActive={
              activeTabId === tabId && activeSourceDigestId === digest.id
            }
            onViewSource={() => handleViewSource(digest)}
          />
        );
      })}
    </div>
  );
}

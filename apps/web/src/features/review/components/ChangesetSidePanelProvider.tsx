import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { SidePanel } from "@web/components/ui/SidePanel";
import { TabbedPanel } from "@web/components/ui/TabbedPanel";

interface ChangesetSidePanelTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface ChangesetSidePanelContextValue {
  openTab: (tab: ChangesetSidePanelTab) => void;
  closeTab: (id: string) => void;
  // 트리거(예: 원문 보기 아이콘)가 "지금 이 탭이 보이는 중인지" 판단해 자기
  // 활성 표시를 켤 수 있어야 한다(surface-inventory.md "원문 링크 활성" —
  // 카드 전체가 아니라 트리거 자신만 활성화, 같은 탭을 가리키는 트리거끼리
  // 배타적).
  activeTabId: string | null;
}

const ChangesetSidePanelContext =
  createContext<ChangesetSidePanelContextValue | null>(null);

// 원문·Digest 상세·Reference 상세가 브라우저 탭처럼 하나의 사이드뷰를 공유하는
// 다중 탭 시스템(surface-inventory.md "Digest 상세" §사이드뷰) — 지금은 원문
// 탭만 열리지만, 같은 id로 다시 openTab하면 새 탭을 추가하지 않고 기존 탭을
// 포커스하는 규약은 다른 탭 종류가 추가될 때도 그대로 재사용된다.
export function useChangesetSidePanel(): ChangesetSidePanelContextValue {
  const context = useContext(ChangesetSidePanelContext);
  if (!context) {
    throw new Error(
      "useChangesetSidePanel must be called within ChangesetSidePanelProvider.",
    );
  }
  return context;
}

interface ChangesetSidePanelProviderProps {
  children: ReactNode;
}

export function ChangesetSidePanelProvider({
  children,
}: ChangesetSidePanelProviderProps) {
  const [tabs, setTabs] = useState<ChangesetSidePanelTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // 참조가 매 렌더 안정적이어야 이 함수를 의존성으로 받는 호출부가 불필요하게
  // 다시 실행되지 않는다.
  const openTab = useCallback((tab: ChangesetSidePanelTab) => {
    setTabs((prev) =>
      prev.some((t) => t.id === tab.id) ? prev : [...prev, tab],
    );
    setActiveTabId(tab.id);
  }, []);

  // openTab과 같은 이유로 안정적 참조가 필요하다 — 이제 context로 노출돼 소비처가
  // 여럿(카드마다 하나)이라, 매 렌더 새 함수면 contextValue useMemo가 매번
  // 무효화된다.
  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((prevActiveId) =>
        prevActiveId === id
          ? (next[next.length - 1]?.id ?? null)
          : prevActiveId,
      );
      return next;
    });
  }, []);

  function closeAllTabs() {
    setTabs([]);
    setActiveTabId(null);
  }

  const contextValue = useMemo(
    () => ({ openTab, closeTab, activeTabId }),
    [openTab, closeTab, activeTabId],
  );

  return (
    <ChangesetSidePanelContext.Provider value={contextValue}>
      <div className="flex min-h-0 min-w-0 flex-1">
        {children}
        {tabs.length > 0 && activeTabId && (
          <SidePanel boundaryName="changeset-side-panel" onClose={closeAllTabs}>
            <TabbedPanel
              tabs={tabs.map((tab) => ({
                id: tab.id,
                label: tab.label,
                content: tab.content,
                onClose: () => closeTab(tab.id),
              }))}
              activeTabId={activeTabId}
              onActiveTabChange={setActiveTabId}
            />
          </SidePanel>
        )}
      </div>
    </ChangesetSidePanelContext.Provider>
  );
}

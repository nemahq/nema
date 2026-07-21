import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
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
}

const ChangesetSidePanelContext =
  createContext<ChangesetSidePanelContextValue | null>(null);

// 원문·Digest 상세·Reference 상세가 브라우저 탭처럼 하나의 사이드뷰를 공유하는
// 다중 탭 시스템(surface-inventory.md "Digest 상세" §사이드뷰) — 지금은 원문
// 탭만 열리지만, 같은 id로 다시 openTab하면 새 탭을 추가하지 않고 기존 탭을
// 포커스하는 규약은 다른 탭 종류가 추가될 때도 그대로 재사용된다.
// 다이제스트·레퍼런스 카드에 원문 보기 트리거가 아직 안 붙어서(폴리싱 다음 라운드
// 예정) 이 훅의 소비처가 지금은 없다 — knip이 dead export로 잡는 걸 막기 위해
// @lintignore 태그를 붙인다.
/** @lintignore */
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

  function closeTab(id: string) {
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeTabId === id) {
      setActiveTabId(next[next.length - 1]?.id ?? null);
    }
  }

  function closeAllTabs() {
    setTabs([]);
    setActiveTabId(null);
  }

  return (
    <ChangesetSidePanelContext.Provider value={{ openTab }}>
      <div className="flex min-h-0 flex-1">
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

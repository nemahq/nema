import { Suspense, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { cn } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { findLeafIds, hydrate, SplitContainer } from "@web/components/ui/split";
import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { TabbedPanel } from "@web/components/ui/TabbedPanel";
import { useContentTab } from "@web/features/session/contexts/ContentTabContext";
import { useSplitPane } from "@web/features/session/contexts/SplitPaneContext";
import { useDraftTab } from "@web/features/session/hooks/useDraftTab";
import { useHelpTab } from "@web/features/session/hooks/useHelpTab";
import { useRetrievalTabs } from "@web/features/session/hooks/useRetrievalTabs";
import { reconcileTabsWithPanes } from "@web/features/session/hooks/useTabPaneReconciliation";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";

import { ContentPanelSkeleton } from "./ContentPanelSkeleton";

const MAX_TAB_SHORTCUT = 9;

const TAB_HOTKEYS = Array.from(
  { length: MAX_TAB_SHORTCUT },
  (_, i) => `meta+${i + 1}, ctrl+${i + 1}`,
).join(", ");

function ContentPanelInner() {
  const { setTabOrder: syncTabOrder } = useContentTab();
  const {
    splitTree,
    paneMap,
    focusedPaneId,
    setFocusedPane,
    setPaneActiveTab,
    setPaneMap,
    setSplitTree,
  } = useSplitPane();

  const draftTab = useDraftTab();
  const retrievalTabs = useRetrievalTabs();
  const helpTab = useHelpTab();

  const allTabs = [draftTab, ...retrievalTabs, helpTab];
  const tabs: TabbedPanelTab[] = allTabs.filter(
    (tab): tab is TabbedPanelTab => tab !== undefined,
  );
  const tabMap = new Map(tabs.map((tab) => [tab.id, tab]));

  // --- 탭-패인 재조정 ---
  const currentTabIds = new Set(tabs.map((t) => t.id));
  const reconciled = reconcileTabsWithPanes({
    currentTabIds,
    paneMap,
    splitTree,
    focusedPaneId,
  });

  if (reconciled.changed) {
    setPaneMap(reconciled.paneMap);
    setSplitTree(reconciled.splitTree);
    if (reconciled.focusedPaneId !== focusedPaneId) {
      setFocusedPane(reconciled.focusedPaneId);
    }
  }

  // --- 전역 tabOrder 동기화 ---
  const leafIds = useMemo(
    function computeLeafIds() {
      return findLeafIds(splitTree);
    },
    [splitTree],
  );
  const globalTabOrder = useMemo(
    function computeGlobalTabOrder() {
      return leafIds.flatMap((paneId) => paneMap.get(paneId)?.tabIds ?? []);
    },
    [leafIds, paneMap],
  );

  useEffect(
    function syncTabOrderToContext() {
      syncTabOrder(globalTabOrder);
    },
    [globalTabOrder, syncTabOrder],
  );

  // --- 포커스된 패인의 탭 ---
  const focusedPane = paneMap.get(focusedPaneId);
  const focusedTabs = focusedPane
    ? focusedPane.tabIds
        .map((id) => tabMap.get(id))
        .filter((t): t is TabbedPanelTab => t !== undefined)
    : [];

  const focusedActiveTab = focusedPane
    ? (tabMap.get(focusedPane.activeTabId) ?? focusedTabs[0])
    : undefined;

  // --- 핫키: Cmd+1-9 → 포커스된 패인의 N번째 탭 ---
  useHotkeys(
    TAB_HOTKEYS,
    (e) => {
      e.preventDefault();
      const num = parseInt(e.key, 10);
      const tab = focusedTabs[num - 1];
      if (tab) {
        setPaneActiveTab(focusedPaneId, tab.id);
      }
    },
    {
      enabled: focusedTabs.length > 1,
      enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"],
    },
  );

  // --- 탭 닫기 → 포커스된 패인의 활성 탭 ---
  useRegisterAction("tab.close", {
    execute: () => focusedActiveTab?.onClose?.(),
    enabled: !!focusedActiveTab?.onClose,
  });

  // --- 렌더링 ---
  const isSinglePane = leafIds.length <= 1;

  if (isSinglePane) {
    const singlePaneTabs = leafIds[0]
      ? (paneMap.get(leafIds[0])?.tabIds ?? [])
          .map((id) => tabMap.get(id))
          .filter((t): t is TabbedPanelTab => t !== undefined)
      : tabs;

    const singlePaneState = leafIds[0] ? paneMap.get(leafIds[0]) : undefined;
    const singleActiveTabId = singlePaneState
      ? singlePaneState.activeTabId || singlePaneTabs[0]?.id || ""
      : (tabs[0]?.id ?? "");

    return (
      <TabbedPanel
        tabs={singlePaneTabs}
        activeTabId={singleActiveTabId}
        onActiveTabChange={(tabId) => {
          if (leafIds[0]) {
            setPaneActiveTab(leafIds[0], tabId);
          }
        }}
      />
    );
  }

  const contentMap = new Map<string, React.ReactNode>();
  for (const paneId of leafIds) {
    const paneState = paneMap.get(paneId);
    const paneTabs = paneState
      ? paneState.tabIds
          .map((id) => tabMap.get(id))
          .filter((t): t is TabbedPanelTab => t !== undefined)
      : [];

    const paneActiveTabId = paneState?.activeTabId ?? paneTabs[0]?.id ?? "";

    contentMap.set(
      paneId,
      <PaneTabbedPanel
        paneId={paneId}
        tabs={paneTabs}
        activeTabId={paneActiveTabId}
        isFocused={paneId === focusedPaneId}
        onFocus={() => setFocusedPane(paneId)}
        onActiveTabChange={(tabId) => setPaneActiveTab(paneId, tabId)}
      />,
    );
  }

  const hydratedTree = hydrate(splitTree, contentMap);

  return <SplitContainer root={hydratedTree} />;
}

interface PaneTabbedPanelProps {
  paneId: string;
  tabs: TabbedPanelTab[];
  activeTabId: string;
  isFocused: boolean;
  onFocus: () => void;
  onActiveTabChange: (tabId: string) => void;
}

function PaneTabbedPanel({
  tabs,
  activeTabId,
  isFocused,
  onFocus,
  onActiveTabChange,
}: PaneTabbedPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col min-w-0 min-h-0",
        isFocused && "ring-1 ring-inset ring-brand/30",
      )}
      onPointerDown={onFocus}
    >
      <TabbedPanel
        tabs={tabs}
        activeTabId={activeTabId}
        onActiveTabChange={onActiveTabChange}
      />
    </div>
  );
}

export function ContentPanel() {
  return (
    <div className="flex flex-1 flex-col bg-surface-card min-w-0">
      <ErrorBoundary
        boundaryName="content-panel"
        fallbackRender={(props) => <SectionErrorFallback {...props} />}
      >
        <Suspense fallback={<ContentPanelSkeleton />}>
          <ContentPanelInner />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

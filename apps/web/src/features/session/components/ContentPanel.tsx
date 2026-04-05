import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import type { DropPosition } from "./DropZoneOverlay";
import { DropZoneOverlay } from "./DropZoneOverlay";

const MAX_TAB_SHORTCUT = 9;

const TAB_HOTKEYS = Array.from(
  { length: MAX_TAB_SHORTCUT },
  (_, i) => `meta+${i + 1}, ctrl+${i + 1}`,
).join(", ");

const TAB_DND_TYPE = "application/x-nema-tab";

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
    splitPaneWithTab,
    moveTabToPane,
  } = useSplitPane();

  const draftTab = useDraftTab();
  const retrievalTabs = useRetrievalTabs();
  const helpTab = useHelpTab();

  const allTabs = [draftTab, ...retrievalTabs, helpTab];
  const tabs: TabbedPanelTab[] = allTabs.filter(
    (tab): tab is TabbedPanelTab => tab !== undefined,
  );
  const tabMap = new Map(tabs.map((tab) => [tab.id, tab]));

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

  const [isDragging, setIsDragging] = useState(false);

  const handleTabDragStart = useCallback(function handleTabDragStart(
    paneId: string,
    tabId: string,
    e: React.DragEvent,
  ) {
    e.dataTransfer.setData(
      TAB_DND_TYPE,
      JSON.stringify({ tabId, sourcePaneId: paneId }),
    );
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
  }, []);

  useEffect(
    function listenDragEnd() {
      if (!isDragging) {
        return;
      }
      function onDragEnd() {
        setIsDragging(false);
      }
      document.addEventListener("dragend", onDragEnd);
      return () => document.removeEventListener("dragend", onDragEnd);
    },
    [isDragging],
  );

  const handlePaneDrop = useCallback(
    function handlePaneDrop(
      targetPaneId: string,
      position: DropPosition,
      e: React.DragEvent,
    ) {
      const raw = e.dataTransfer.getData(TAB_DND_TYPE);
      if (!raw) {
        return;
      }
      const { tabId, sourcePaneId } = JSON.parse(raw) as {
        tabId: string;
        sourcePaneId: string;
      };

      if (position === "center") {
        if (sourcePaneId !== targetPaneId) {
          moveTabToPane(tabId, targetPaneId);
        }
      } else {
        const direction =
          position === "left" || position === "right"
            ? "horizontal"
            : "vertical";
        splitPaneWithTab(targetPaneId, tabId, direction);
      }
      setIsDragging(false);
    },
    [moveTabToPane, splitPaneWithTab],
  );

  const focusedPane = paneMap.get(focusedPaneId);
  const focusedTabs = focusedPane
    ? focusedPane.tabIds
        .map((id) => tabMap.get(id))
        .filter((t): t is TabbedPanelTab => t !== undefined)
    : [];

  const focusedActiveTab = focusedPane
    ? (tabMap.get(focusedPane.activeTabId) ?? focusedTabs[0])
    : undefined;

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

  useRegisterAction("tab.close", {
    execute: () => focusedActiveTab?.onClose?.(),
    enabled: !!focusedActiveTab?.onClose,
  });

  useRegisterAction("split.right", {
    execute: () => {
      if (focusedActiveTab) {
        splitPaneWithTab(focusedPaneId, focusedActiveTab.id, "horizontal");
      }
    },
    enabled: focusedTabs.length >= 2 && !!focusedActiveTab,
  });

  useRegisterAction("split.down", {
    execute: () => {
      if (focusedActiveTab) {
        splitPaneWithTab(focusedPaneId, focusedActiveTab.id, "vertical");
      }
    },
    enabled: focusedTabs.length >= 2 && !!focusedActiveTab,
  });

  useRegisterAction("split.focusNextPane", {
    execute: () => {
      const currentIndex = leafIds.indexOf(focusedPaneId);
      const nextIndex = (currentIndex + 1) % leafIds.length;
      setFocusedPane(leafIds[nextIndex]);
    },
    enabled: leafIds.length > 1,
  });

  useRegisterAction("split.focusPrevPane", {
    execute: () => {
      const currentIndex = leafIds.indexOf(focusedPaneId);
      const prevIndex = (currentIndex - 1 + leafIds.length) % leafIds.length;
      setFocusedPane(leafIds[prevIndex]);
    },
    enabled: leafIds.length > 1,
  });

  function buildPaneContent(paneId: string) {
    const paneState = paneMap.get(paneId);
    const paneTabs = paneState
      ? paneState.tabIds
          .map((id) => tabMap.get(id))
          .filter((t): t is TabbedPanelTab => t !== undefined)
      : [];
    const paneActiveTabId = paneState?.activeTabId ?? paneTabs[0]?.id ?? "";

    return (
      <PaneTabbedPanel
        paneId={paneId}
        tabs={paneTabs}
        activeTabId={paneActiveTabId}
        isFocused={paneId === focusedPaneId}
        isDragging={isDragging}
        disableEdges={paneTabs.length <= 1}
        onFocus={() => setFocusedPane(paneId)}
        onActiveTabChange={(tabId) => setPaneActiveTab(paneId, tabId)}
        onTabDragStart={(tabId, e) => handleTabDragStart(paneId, tabId, e)}
        onDrop={(position, e) => handlePaneDrop(paneId, position, e)}
      />
    );
  }

  const isSinglePane = leafIds.length <= 1;

  if (isSinglePane) {
    const singlePaneId = leafIds[0] ?? focusedPaneId;
    return buildPaneContent(singlePaneId);
  }

  const contentMap = new Map<string, React.ReactNode>();
  for (const paneId of leafIds) {
    contentMap.set(paneId, buildPaneContent(paneId));
  }

  const hydratedTree = hydrate(splitTree, contentMap);

  return <SplitContainer root={hydratedTree} />;
}

interface PaneTabbedPanelProps {
  paneId: string;
  tabs: TabbedPanelTab[];
  activeTabId: string;
  isFocused: boolean;
  isDragging: boolean;
  disableEdges: boolean;
  onFocus: () => void;
  onActiveTabChange: (tabId: string) => void;
  onTabDragStart: (tabId: string, e: React.DragEvent) => void;
  onDrop: (position: DropPosition, e: React.DragEvent) => void;
}

function PaneTabbedPanel({
  tabs,
  activeTabId,
  isFocused,
  isDragging,
  disableEdges,
  onFocus,
  onActiveTabChange,
  onTabDragStart,
  onDrop,
}: PaneTabbedPanelProps) {
  function handleTabDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes(TAB_DND_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }

  function handleTabDrop(e: React.DragEvent) {
    onDrop("center", e);
  }

  return (
    <div
      className={cn(
        "relative flex flex-1 flex-col min-w-0 min-h-0",
        isFocused && "ring-1 ring-inset ring-brand/30",
      )}
      onPointerDown={onFocus}
    >
      <TabbedPanel
        tabs={tabs}
        activeTabId={activeTabId}
        onActiveTabChange={onActiveTabChange}
        onTabDragStart={onTabDragStart}
        onTabDragOver={handleTabDragOver}
        onTabDrop={handleTabDrop}
      />
      {isDragging && (
        <DropZoneOverlay disableEdges={disableEdges} onDrop={onDrop} />
      )}
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

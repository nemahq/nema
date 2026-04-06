import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";

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
import { DropZoneHighlight, useDropZone } from "./DropZoneOverlay";

const MAX_TAB_SHORTCUT = 9;

const TAB_HOTKEYS = Array.from(
  { length: MAX_TAB_SHORTCUT },
  (_, i) => `meta+${i + 1}, ctrl+${i + 1}`,
).join(", ");

const TAB_DND_TYPE = "application/x-nema-tab";

interface TabDragData {
  tabId: string;
  sourcePaneId: string;
}

function parseDragData(e: React.DragEvent): TabDragData | null {
  const raw = e.dataTransfer.getData(TAB_DND_TYPE);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).tabId !== "string" ||
      typeof (parsed as Record<string, unknown>).sourcePaneId !== "string"
    ) {
      return null;
    }
    return parsed as TabDragData;
  } catch {
    return null;
  }
}

function ContentPanelInner() {
  const { setTabOrder: syncTabOrder } = useContentTab();
  const {
    splitTree,
    paneMap,
    focusedPaneId,
    setFocusedPane,
    setPaneActiveTab,
    reorderTabsInPane,
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

  const currentTabIdsKey = tabs.map((t) => t.id).join(",");

  useEffect(
    function reconcileTabPaneState() {
      const currentTabIds = new Set(
        currentTabIdsKey.split(",").filter(Boolean),
      );
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
    },
    [
      currentTabIdsKey,
      paneMap,
      splitTree,
      focusedPaneId,
      setPaneMap,
      setSplitTree,
      setFocusedPane,
    ],
  );

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
  }, []);

  const handlePaneDrop = useCallback(
    function handlePaneDrop(
      targetPaneId: string,
      position: DropPosition,
      e: React.DragEvent,
    ) {
      const parsed = parseDragData(e);
      if (!parsed) {
        return;
      }
      const { tabId, sourcePaneId } = parsed;

      if (position === "center") {
        if (sourcePaneId !== targetPaneId) {
          moveTabToPane(tabId, targetPaneId);
        }
      } else {
        // 같은 패인 + 유일한 탭이면 분할 불가 (source가 비어서 즉시 해제됨)
        const sourcePane = paneMap.get(sourcePaneId);
        if (
          sourcePaneId === targetPaneId &&
          sourcePane &&
          sourcePane.tabIds.length <= 1
        ) {
          return;
        }
        const direction =
          position === "left" || position === "right"
            ? "horizontal"
            : "vertical";
        const insertPosition =
          position === "left" || position === "top" ? "before" : "after";
        splitPaneWithTab(
          targetPaneId,
          tabId,
          direction,
          insertPosition,
          sourcePaneId,
        );
      }
    },
    [moveTabToPane, splitPaneWithTab, paneMap],
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
        isFocused={isSinglePane ? undefined : paneId === focusedPaneId}
        disableEdges={false}
        onFocus={() => setFocusedPane(paneId)}
        onActiveTabChange={(tabId) => setPaneActiveTab(paneId, tabId)}
        onTabDragStart={(tabId, e) => handleTabDragStart(paneId, tabId, e)}
        onDrop={(position, e) => handlePaneDrop(paneId, position, e)}
        onReorderTabs={(tabIds) => reorderTabsInPane(paneId, tabIds)}
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
  isFocused?: boolean;
  disableEdges: boolean;
  onFocus: () => void;
  onActiveTabChange: (tabId: string) => void;
  onTabDragStart: (tabId: string, e: React.DragEvent) => void;
  onDrop: (position: DropPosition, e: React.DragEvent) => void;
  onReorderTabs: (tabIds: string[]) => void;
}

function PaneTabbedPanel({
  paneId,
  tabs,
  activeTabId,
  isFocused,
  disableEdges,
  onFocus,
  onActiveTabChange,
  onTabDragStart,
  onDrop,
  onReorderTabs,
}: PaneTabbedPanelProps) {
  const { containerRef, activePosition, resetDrag, containerProps } =
    useDropZone(TAB_DND_TYPE, disableEdges);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    resetDrag();
    onDrop(activePosition ?? "center", e);
  }

  function handleTabDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes(TAB_DND_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }

  function handleTabDrop(e: React.DragEvent, dropTargetTabId: string) {
    e.preventDefault();
    resetDrag();
    const parsed = parseDragData(e);
    if (!parsed) {
      return;
    }
    if (parsed.sourcePaneId === paneId) {
      const currentOrder = tabs.map((t) => t.id);
      const fromIndex = currentOrder.indexOf(parsed.tabId);
      const toIndex = currentOrder.indexOf(dropTargetTabId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return;
      }
      const next = [...currentOrder];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, parsed.tabId);
      onReorderTabs(next);
    } else {
      onDrop("center", e);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-1 flex-col min-w-0 min-h-0"
      onPointerDown={onFocus}
      onDrop={handleDrop}
      {...containerProps}
    >
      <TabbedPanel
        tabs={tabs}
        activeTabId={activeTabId}
        onActiveTabChange={onActiveTabChange}
        focused={isFocused}
        onTabDragStart={onTabDragStart}
        onTabDragOver={handleTabDragOver}
        onTabDrop={handleTabDrop}
        overlay={<DropZoneHighlight activePosition={activePosition} />}
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

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

import type {
  ResizeDirection,
  SplitSkeletonNode,
} from "@web/components/ui/split";
import { findLeafIds, insertLeaf, removeLeaf } from "@web/components/ui/split";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import type { PaneState } from "@web/features/session/hooks/useSplitLayoutPersist";
import { useSplitLayoutPersist } from "@web/features/session/hooks/useSplitLayoutPersist";

const DEFAULT_PANE_ID = "default-pane";

function nextActiveAfterRemoval(
  tabIds: string[],
  currentActiveId: string,
  removedId: string,
): string {
  if (currentActiveId !== removedId) {
    return currentActiveId;
  }
  return tabIds[0] ?? "";
}

function defaultPaneMap(): Map<string, PaneState> {
  return new Map([[DEFAULT_PANE_ID, { tabIds: [], activeTabId: "" }]]);
}

interface SplitPaneContextValue {
  splitTree: SplitSkeletonNode;
  paneMap: Map<string, PaneState>;
  focusedPaneId: string;

  splitPaneWithTab: (
    paneId: string,
    tabId: string,
    direction: ResizeDirection,
    position?: "before" | "after",
  ) => void;
  closePane: (paneId: string) => void;
  moveTabToPane: (tabId: string, targetPaneId: string) => void;
  setFocusedPane: (paneId: string) => void;
  setPaneActiveTab: (paneId: string, tabId: string) => void;
  // ContentPanel 재조정(reconciliation) 전용. 일반 소비자는 splitPaneWithTab/closePane/moveTabToPane 사용
  setSplitTree: (tree: SplitSkeletonNode) => void;
  setPaneMap: (paneMap: Map<string, PaneState>) => void;
}

const SplitPaneContext = createContext<SplitPaneContextValue | null>(null);

interface SplitPaneProviderProps {
  children: ReactNode;
}

export function SplitPaneProvider({ children }: SplitPaneProviderProps) {
  const sessionId = useSessionId();
  const { splitLayout, setSplitLayout } = useSplitLayoutPersist(sessionId);

  const [splitTree, setSplitTreeState] = useState<SplitSkeletonNode>(
    () => splitLayout?.tree ?? { type: "leaf", id: DEFAULT_PANE_ID },
  );
  const [paneMap, setPaneMapState] = useState<Map<string, PaneState>>(
    () => splitLayout?.paneMap ?? defaultPaneMap(),
  );
  const [focusedPaneId, setFocusedPaneIdState] = useState<string>(
    () => splitLayout?.focusedPaneId ?? DEFAULT_PANE_ID,
  );

  const persistSplit = useCallback(
    function persistSplit(
      nextTree: SplitSkeletonNode,
      nextPaneMap: Map<string, PaneState>,
      nextFocused: string,
    ) {
      setSplitTreeState(nextTree);
      setPaneMapState(nextPaneMap);
      setFocusedPaneIdState(nextFocused);
      setSplitLayout({
        tree: nextTree,
        paneMap: nextPaneMap,
        focusedPaneId: nextFocused,
      });
    },
    [setSplitLayout],
  );

  const splitPaneWithTab = useCallback(
    function splitPaneWithTab(
      paneId: string,
      tabId: string,
      direction: ResizeDirection,
      position: "before" | "after" = "after",
    ) {
      const newPaneId = crypto.randomUUID();
      const branchId = crypto.randomUUID();
      let nextTree = insertLeaf(
        splitTree,
        paneId,
        newPaneId,
        branchId,
        direction,
        position,
      );

      const nextPaneMap = new Map(paneMap);

      const sourcePane = nextPaneMap.get(paneId);
      if (sourcePane) {
        const nextTabIds = sourcePane.tabIds.filter((id) => id !== tabId);
        if (nextTabIds.length === 0) {
          nextPaneMap.delete(paneId);
          const pruned = removeLeaf(nextTree, paneId);
          if (pruned) {
            nextTree = pruned;
          }
        } else {
          nextPaneMap.set(paneId, {
            tabIds: nextTabIds,
            activeTabId: nextActiveAfterRemoval(
              nextTabIds,
              sourcePane.activeTabId,
              tabId,
            ),
          });
        }
      }

      nextPaneMap.set(newPaneId, { tabIds: [tabId], activeTabId: tabId });

      persistSplit(nextTree, nextPaneMap, newPaneId);
    },
    [splitTree, paneMap, persistSplit],
  );

  const closePane = useCallback(
    function closePane(paneId: string) {
      const nextTree = removeLeaf(splitTree, paneId);
      const nextPaneMap = new Map(paneMap);
      nextPaneMap.delete(paneId);

      if (!nextTree) {
        persistSplit(
          { type: "leaf", id: DEFAULT_PANE_ID },
          defaultPaneMap(),
          DEFAULT_PANE_ID,
        );
        return;
      }

      const leafIds = findLeafIds(nextTree);
      const nextFocused = leafIds.includes(focusedPaneId)
        ? focusedPaneId
        : (leafIds[0] ?? DEFAULT_PANE_ID);

      persistSplit(nextTree, nextPaneMap, nextFocused);
    },
    [splitTree, paneMap, focusedPaneId, persistSplit],
  );

  const moveTabToPane = useCallback(
    function moveTabToPane(tabId: string, targetPaneId: string) {
      const nextPaneMap = new Map(paneMap);

      let sourcePaneId: string | null = null;
      for (const [id, pane] of nextPaneMap) {
        if (pane.tabIds.includes(tabId)) {
          sourcePaneId = id;
          break;
        }
      }

      if (!sourcePaneId || sourcePaneId === targetPaneId) {
        return;
      }

      const sourcePane = nextPaneMap.get(sourcePaneId);
      const targetPane = nextPaneMap.get(targetPaneId);
      if (!sourcePane || !targetPane) {
        return;
      }

      const nextSourceTabIds = sourcePane.tabIds.filter((id) => id !== tabId);
      nextPaneMap.set(sourcePaneId, {
        tabIds: nextSourceTabIds,
        activeTabId: nextActiveAfterRemoval(
          nextSourceTabIds,
          sourcePane.activeTabId,
          tabId,
        ),
      });

      nextPaneMap.set(targetPaneId, {
        tabIds: [...targetPane.tabIds, tabId],
        activeTabId: tabId,
      });

      let nextTree = splitTree;
      let nextFocused = focusedPaneId;

      if (nextSourceTabIds.length === 0) {
        const pruned = removeLeaf(splitTree, sourcePaneId);
        nextPaneMap.delete(sourcePaneId);

        if (!pruned) {
          persistSplit(
            { type: "leaf", id: DEFAULT_PANE_ID },
            defaultPaneMap(),
            DEFAULT_PANE_ID,
          );
          return;
        }

        nextTree = pruned;
        const leafIds = findLeafIds(pruned);
        nextFocused = leafIds.includes(focusedPaneId)
          ? focusedPaneId
          : (leafIds[0] ?? DEFAULT_PANE_ID);
      }

      persistSplit(nextTree, nextPaneMap, nextFocused);
    },
    [splitTree, paneMap, focusedPaneId, persistSplit],
  );

  const setFocusedPane = useCallback(
    function setFocusedPane(paneId: string) {
      setFocusedPaneIdState(paneId);
      setSplitLayout({ tree: splitTree, paneMap, focusedPaneId: paneId });
    },
    [splitTree, paneMap, setSplitLayout],
  );

  const setPaneActiveTab = useCallback(
    function setPaneActiveTab(paneId: string, tabId: string) {
      const pane = paneMap.get(paneId);
      if (!pane || pane.activeTabId === tabId) {
        return;
      }
      const nextPaneMap = new Map(paneMap);
      nextPaneMap.set(paneId, { ...pane, activeTabId: tabId });
      setPaneMapState(nextPaneMap);
      setSplitLayout({ tree: splitTree, paneMap: nextPaneMap, focusedPaneId });
    },
    [paneMap, splitTree, focusedPaneId, setSplitLayout],
  );

  const setSplitTree = useCallback(function setSplitTree(
    tree: SplitSkeletonNode,
  ) {
    setSplitTreeState(tree);
  }, []);

  const setPaneMap = useCallback(function setPaneMap(
    nextPaneMap: Map<string, PaneState>,
  ) {
    setPaneMapState(nextPaneMap);
  }, []);

  return (
    <SplitPaneContext
      value={{
        splitTree,
        paneMap,
        focusedPaneId,
        splitPaneWithTab,
        closePane,
        moveTabToPane,
        setFocusedPane,
        setPaneActiveTab,
        setSplitTree,
        setPaneMap,
      }}
    >
      {children}
    </SplitPaneContext>
  );
}

export function useSplitPane() {
  const ctx = useContext(SplitPaneContext);
  if (!ctx) {
    throw new Error("useSplitPane must be used within SplitPaneProvider.");
  }
  return ctx;
}

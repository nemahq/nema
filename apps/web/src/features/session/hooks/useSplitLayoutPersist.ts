import { useCallback, useEffect, useRef, useState } from "react";

import type { SplitSkeletonNode } from "@web/components/ui/split/tree-ops";
import { getRecordEntry, setRecordEntry } from "@web/utils/localStorage";

export interface PaneState {
  tabIds: string[];
  activeTabId: string;
}

export interface SplitLayoutState {
  tree: SplitSkeletonNode;
  paneMap: Map<string, PaneState>;
  focusedPaneId: string;
}

interface SerializedSplitLayout {
  tree: SplitSkeletonNode;
  paneMap: Record<string, PaneState>;
  focusedPaneId: string;
}

function loadSplitLayout(sessionId: string): SplitLayoutState | null {
  const raw = getRecordEntry("splitLayout", sessionId);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SerializedSplitLayout;
    if (!parsed.tree || !parsed.paneMap || !parsed.focusedPaneId) {
      return null;
    }
    return {
      tree: parsed.tree,
      paneMap: new Map(Object.entries(parsed.paneMap)),
      focusedPaneId: parsed.focusedPaneId,
    };
  } catch {
    return null;
  }
}

function persistSplitLayout(sessionId: string, state: SplitLayoutState): void {
  const serialized: SerializedSplitLayout = {
    tree: state.tree,
    paneMap: Object.fromEntries(state.paneMap),
    focusedPaneId: state.focusedPaneId,
  };
  setRecordEntry("splitLayout", sessionId, JSON.stringify(serialized));
}

export function useSplitLayoutPersist(sessionId: string) {
  const [splitLayout, setSplitLayout] = useState<SplitLayoutState | null>(() =>
    loadSplitLayout(sessionId),
  );
  const prevSessionIdRef = useRef(sessionId);

  useEffect(
    function syncSplitLayoutToStorage() {
      if (prevSessionIdRef.current !== sessionId) {
        prevSessionIdRef.current = sessionId;
        return;
      }
      if (splitLayout) {
        persistSplitLayout(sessionId, splitLayout);
      }
    },
    [sessionId, splitLayout],
  );

  useEffect(
    function resetSplitLayoutOnSessionChange() {
      setSplitLayout(loadSplitLayout(sessionId));
    },
    [sessionId],
  );

  const updateSplitLayout = useCallback((state: SplitLayoutState) => {
    setSplitLayout(state);
  }, []);

  return { splitLayout, setSplitLayout: updateSplitLayout };
}

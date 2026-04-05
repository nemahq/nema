import type { SplitSkeletonNode } from "@web/components/ui/split";
import { findLeafIds, removeLeaf } from "@web/components/ui/split";
import type { PaneState } from "@web/features/session/hooks/useSplitLayoutPersist";

interface ReconciliationInput {
  currentTabIds: Set<string>;
  paneMap: Map<string, PaneState>;
  splitTree: SplitSkeletonNode;
  focusedPaneId: string;
}

interface ReconciliationResult {
  paneMap: Map<string, PaneState>;
  splitTree: SplitSkeletonNode;
  focusedPaneId: string;
  changed: boolean;
}

/**
 * 탭 훅이 제공하는 현재 탭 목록과 패인 상태의 정합성을 맞춘다.
 * 새 탭은 포커스된 패인에 배정하고, 사라진 탭은 제거하고, 빈 패인은 트리에서 정리한다.
 */
export function reconcileTabsWithPanes(
  input: ReconciliationInput,
): ReconciliationResult {
  const { currentTabIds, paneMap, splitTree, focusedPaneId } = input;

  const assignedTabIds = new Set<string>();
  for (const pane of paneMap.values()) {
    for (const id of pane.tabIds) {
      assignedTabIds.add(id);
    }
  }

  const unassignedTabIds = [...currentTabIds].filter(
    (id) => !assignedTabIds.has(id),
  );

  let hasRemovedTabs = false;
  for (const pane of paneMap.values()) {
    for (const id of pane.tabIds) {
      if (!currentTabIds.has(id)) {
        hasRemovedTabs = true;
        break;
      }
    }
    if (hasRemovedTabs) {
      break;
    }
  }

  if (unassignedTabIds.length === 0 && !hasRemovedTabs) {
    return { paneMap, splitTree, focusedPaneId, changed: false };
  }

  const nextPaneMap = new Map(paneMap);
  let nextTree = splitTree;
  let nextFocused = focusedPaneId;
  const panesToRemove: string[] = [];

  for (const [paneId, pane] of nextPaneMap) {
    const filteredTabIds = pane.tabIds.filter((id) => currentTabIds.has(id));
    if (filteredTabIds.length !== pane.tabIds.length) {
      if (filteredTabIds.length === 0) {
        panesToRemove.push(paneId);
      } else {
        const nextActive = currentTabIds.has(pane.activeTabId)
          ? pane.activeTabId
          : (filteredTabIds[0] ?? "");
        nextPaneMap.set(paneId, {
          tabIds: filteredTabIds,
          activeTabId: nextActive,
        });
      }
    }
  }

  for (const paneId of panesToRemove) {
    nextPaneMap.delete(paneId);
    const pruned = removeLeaf(nextTree, paneId);
    if (pruned) {
      nextTree = pruned;
    }
  }

  if (unassignedTabIds.length > 0) {
    const targetPaneId = nextPaneMap.has(nextFocused)
      ? nextFocused
      : (findLeafIds(nextTree)[0] ?? nextFocused);
    const targetPane = nextPaneMap.get(targetPaneId);
    if (targetPane) {
      nextPaneMap.set(targetPaneId, {
        tabIds: [...targetPane.tabIds, ...unassignedTabIds],
        activeTabId: unassignedTabIds[unassignedTabIds.length - 1],
      });
    }
  }

  const leafIds = findLeafIds(nextTree);
  if (!leafIds.includes(nextFocused)) {
    nextFocused = leafIds[0] ?? focusedPaneId;
  }

  return {
    paneMap: nextPaneMap,
    splitTree: nextTree,
    focusedPaneId: nextFocused,
    changed: true,
  };
}

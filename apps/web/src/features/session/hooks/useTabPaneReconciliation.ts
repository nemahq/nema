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
    if (filteredTabIds.length === pane.tabIds.length) {
      continue;
    }
    if (filteredTabIds.length === 0) {
      panesToRemove.push(paneId);
      continue;
    }

    const activeStillExists = currentTabIds.has(pane.activeTabId);
    let nextActive: string;
    if (activeStillExists) {
      nextActive = pane.activeTabId;
    } else {
      const prevIndex = pane.tabIds.indexOf(pane.activeTabId);
      const nearbyTab = filteredTabIds.find(
        (id) => pane.tabIds.indexOf(id) >= prevIndex,
      );
      nextActive = nearbyTab ?? filteredTabIds[filteredTabIds.length - 1] ?? "";
    }

    nextPaneMap.set(paneId, {
      tabIds: filteredTabIds,
      activeTabId: nextActive,
    });
  }

  for (const paneId of panesToRemove) {
    nextPaneMap.delete(paneId);
    const pruned = removeLeaf(nextTree, paneId);
    if (pruned) {
      nextTree = pruned;
    }
  }

  // 모든 패인이 삭제되면 트리에 남은 마지막 leaf로 빈 패인을 복원한다.
  // removeLeaf는 마지막 leaf 제거 시 null을 반환하므로 트리에는 leaf가 남아 있지만
  // paneMap에서는 삭제된 불일치 상태가 된다. 이를 보정하지 않으면 이후 새 탭 배정이
  // 모두 실패하여 어떤 탭도 열리지 않는다.
  if (nextPaneMap.size === 0) {
    const fallbackId = findLeafIds(nextTree)[0] ?? focusedPaneId;
    nextPaneMap.set(fallbackId, { tabIds: [], activeTabId: "" });
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

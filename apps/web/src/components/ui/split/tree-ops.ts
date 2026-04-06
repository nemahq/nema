import type { ReactNode } from "react";

import type {
  ResizeDirection,
  SplitBranch,
  SplitLeaf,
  SplitNode,
} from "./types";

export type SplitSkeletonLeaf = Omit<SplitLeaf, "content">;

export type SplitSkeletonBranch = Omit<SplitBranch, "children"> & {
  children: [SplitSkeletonNode, SplitSkeletonNode, ...SplitSkeletonNode[]];
};

export type SplitSkeletonNode = SplitSkeletonLeaf | SplitSkeletonBranch;

/** targetLeafId를 branch로 교체하여 분할. position으로 새 leaf의 삽입 위치를 제어 */
export function insertLeaf(
  tree: SplitSkeletonNode,
  targetLeafId: string,
  newLeafId: string,
  branchId: string,
  direction: ResizeDirection,
  position: "before" | "after" = "after",
): SplitSkeletonNode {
  if (tree.type === "leaf") {
    if (tree.id === targetLeafId) {
      const newLeaf: SplitSkeletonLeaf = { type: "leaf", id: newLeafId };
      const children: [SplitSkeletonNode, SplitSkeletonNode] =
        position === "before" ? [newLeaf, tree] : [tree, newLeaf];
      return { type: "branch", id: branchId, direction, children };
    }
    return tree;
  }

  const nextChildren = tree.children.map((child) =>
    insertLeaf(child, targetLeafId, newLeafId, branchId, direction, position),
  ) as [SplitSkeletonNode, SplitSkeletonNode, ...SplitSkeletonNode[]];

  if (nextChildren.every((child, i) => child === tree.children[i])) {
    return tree;
  }

  return { ...tree, children: nextChildren };
}

/** leaf 제거 + 부모 자식 1개면 승격 (prune). root 자체가 제거되면 null 반환 */
export function removeLeaf(
  tree: SplitSkeletonNode,
  leafId: string,
): SplitSkeletonNode | null {
  if (tree.type === "leaf") {
    return tree.id === leafId ? null : tree;
  }

  const nextChildren = tree.children
    .map((child) => removeLeaf(child, leafId))
    .filter((child): child is SplitSkeletonNode => child !== null);

  if (nextChildren.length === tree.children.length) {
    // 변경 없음 — 참조 동일성 유지
    if (nextChildren.every((child, i) => child === tree.children[i])) {
      return tree;
    }
  }

  if (nextChildren.length === 0) {
    return null;
  }

  if (nextChildren.length === 1) {
    return nextChildren[0];
  }

  return {
    ...tree,
    children: nextChildren as [
      SplitSkeletonNode,
      SplitSkeletonNode,
      ...SplitSkeletonNode[],
    ],
    ratios: undefined,
  };
}

/** DFS 순서로 모든 leaf ID 반환 */
export function findLeafIds(tree: SplitSkeletonNode): string[] {
  if (tree.type === "leaf") {
    return [tree.id];
  }
  return tree.children.flatMap(findLeafIds);
}

/** SplitNode에서 content를 제거하여 직렬화 가능한 skeleton으로 변환 */
export function toSkeleton(node: SplitNode): SplitSkeletonNode {
  if (node.type === "leaf") {
    return { type: "leaf", id: node.id };
  }

  return {
    type: "branch",
    id: node.id,
    direction: node.direction,
    ratios: node.ratios,
    children: node.children.map(toSkeleton) as [
      SplitSkeletonNode,
      SplitSkeletonNode,
      ...SplitSkeletonNode[],
    ],
  };
}

/** skeleton에 contentMap을 적용하여 SplitNode로 복원 */
export function hydrate(
  skeleton: SplitSkeletonNode,
  contentMap: Map<string, ReactNode>,
): SplitNode {
  if (skeleton.type === "leaf") {
    return {
      type: "leaf",
      id: skeleton.id,
      content: contentMap.get(skeleton.id) ?? null,
    };
  }

  return {
    ...skeleton,
    children: skeleton.children.map((child) => hydrate(child, contentMap)) as [
      SplitNode,
      SplitNode,
      ...SplitNode[],
    ],
  };
}

import { describe, expect, it } from "vitest";

import type { SplitSkeletonNode } from "./tree-ops";
import {
  findLeafIds,
  hydrate,
  insertLeaf,
  removeLeaf,
  toSkeleton,
} from "./tree-ops";
import type { SplitNode } from "./types";

const LEAF_A: SplitSkeletonNode = { type: "leaf", id: "a" };
const LEAF_B: SplitSkeletonNode = { type: "leaf", id: "b" };
const LEAF_C: SplitSkeletonNode = { type: "leaf", id: "c" };

describe("insertLeaf", () => {
  it("단일 leaf를 branch로 분할한다", () => {
    const result = insertLeaf(LEAF_A, "a", "b", "branch-1", "horizontal");

    expect(result).toEqual({
      type: "branch",
      id: "branch-1",
      direction: "horizontal",
      children: [LEAF_A, { type: "leaf", id: "b" }],
    });
  });

  it("position=before일 때 새 leaf가 앞에 온다", () => {
    const result = insertLeaf(
      LEAF_A,
      "a",
      "b",
      "branch-1",
      "horizontal",
      "before",
    );

    expect(result).toEqual({
      type: "branch",
      id: "branch-1",
      direction: "horizontal",
      children: [{ type: "leaf", id: "b" }, LEAF_A],
    });
  });

  it("대상이 없으면 트리를 그대로 반환한다", () => {
    const result = insertLeaf(LEAF_A, "nonexistent", "b", "br", "vertical");

    expect(result).toBe(LEAF_A);
  });

  it("중첩 트리에서 깊은 leaf를 분할한다", () => {
    const tree: SplitSkeletonNode = {
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [LEAF_A, LEAF_B],
    };

    const result = insertLeaf(tree, "b", "c", "br-new", "vertical");

    expect(result).toEqual({
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [
        LEAF_A,
        {
          type: "branch",
          id: "br-new",
          direction: "vertical",
          children: [LEAF_B, { type: "leaf", id: "c" }],
        },
      ],
    });
  });
});

describe("removeLeaf", () => {
  it("root leaf를 제거하면 null을 반환한다", () => {
    expect(removeLeaf(LEAF_A, "a")).toBeNull();
  });

  it("대상이 없으면 트리를 그대로 반환한다", () => {
    const tree: SplitSkeletonNode = {
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [LEAF_A, LEAF_B],
    };

    const result = removeLeaf(tree, "nonexistent");

    expect(result).toBe(tree);
  });

  it("2자식 branch에서 하나를 제거하면 남은 자식이 승격된다", () => {
    const tree: SplitSkeletonNode = {
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [LEAF_A, LEAF_B],
    };

    const result = removeLeaf(tree, "b");

    expect(result).toEqual(LEAF_A);
  });

  it("3자식 branch에서 하나를 제거하면 2자식 branch가 된다", () => {
    const tree: SplitSkeletonNode = {
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [LEAF_A, LEAF_B, LEAF_C],
    };

    const result = removeLeaf(tree, "b");

    expect(result).toEqual({
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [LEAF_A, LEAF_C],
      ratios: undefined,
    });
  });

  it("기존 ratios가 있는 branch에서 자식을 제거하면 ratios가 초기화된다", () => {
    const tree: SplitSkeletonNode = {
      type: "branch",
      id: "root",
      direction: "horizontal",
      ratios: [0.2, 0.5, 0.3],
      children: [LEAF_A, LEAF_B, LEAF_C],
    };

    const result = removeLeaf(tree, "b");

    expect(result).toEqual({
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [LEAF_A, LEAF_C],
      ratios: undefined,
    });
  });

  it("중첩 트리에서 제거 후 재귀적으로 prune한다", () => {
    const tree: SplitSkeletonNode = {
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [
        LEAF_A,
        {
          type: "branch",
          id: "inner",
          direction: "vertical",
          children: [LEAF_B, LEAF_C],
        },
      ],
    };

    // inner branch에서 c 제거 → inner에 b만 남음 → b가 승격
    // root는 [a, b]가 됨
    const result = removeLeaf(tree, "c");

    expect(result).toEqual({
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [LEAF_A, LEAF_B],
      ratios: undefined,
    });
  });
});

describe("findLeafIds", () => {
  it("단일 leaf에서 ID를 반환한다", () => {
    expect(findLeafIds(LEAF_A)).toEqual(["a"]);
  });

  it("DFS 순서로 모든 leaf ID를 반환한다", () => {
    const tree: SplitSkeletonNode = {
      type: "branch",
      id: "root",
      direction: "horizontal",
      children: [
        LEAF_A,
        {
          type: "branch",
          id: "inner",
          direction: "vertical",
          children: [LEAF_B, LEAF_C],
        },
      ],
    };

    expect(findLeafIds(tree)).toEqual(["a", "b", "c"]);
  });
});

describe("toSkeleton / hydrate round-trip", () => {
  it("SplitNode → skeleton → hydrate로 구조가 보존된다", () => {
    const contentA = "content-a";
    const contentB = "content-b";

    const tree: SplitNode = {
      type: "branch",
      id: "root",
      direction: "horizontal",
      ratios: [0.4, 0.6],
      children: [
        { type: "leaf", id: "a", content: contentA },
        { type: "leaf", id: "b", content: contentB },
      ],
    };

    const skeleton = toSkeleton(tree);

    expect(skeleton).toEqual({
      type: "branch",
      id: "root",
      direction: "horizontal",
      ratios: [0.4, 0.6],
      children: [
        { type: "leaf", id: "a" },
        { type: "leaf", id: "b" },
      ],
    });
    expect("content" in skeleton).toBe(false);

    const contentMap = new Map<string, unknown>([
      ["a", contentA],
      ["b", contentB],
    ]);
    const hydrated = hydrate(
      skeleton,
      contentMap as Map<string, React.ReactNode>,
    );

    expect(hydrated).toEqual(tree);
  });

  it("hydrate 시 contentMap에 없는 leaf는 content가 null이 된다", () => {
    const skeleton: SplitSkeletonNode = { type: "leaf", id: "missing" };
    const hydrated = hydrate(skeleton, new Map());

    expect(hydrated).toEqual({
      type: "leaf",
      id: "missing",
      content: null,
    });
  });
});

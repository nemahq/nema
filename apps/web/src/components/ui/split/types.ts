import type { ReactNode } from "react";

export type ResizeDirection = "horizontal" | "vertical";

export interface SplitLeaf {
  type: "leaf";
  id: string;
  content: ReactNode;
}

export interface SplitBranch {
  type: "branch";
  id: string;
  direction: ResizeDirection;
  children: [SplitNode, SplitNode, ...SplitNode[]];
  ratios?: number[];
}

export type SplitNode = SplitLeaf | SplitBranch;

export const DEFAULT_MIN_SIZE = 120;

export function defaultRatios(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

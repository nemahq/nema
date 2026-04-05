import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@nema-io/weave";

import { ResizeHandle } from "./ResizeHandle";

interface SplitLeaf {
  type: "leaf";
  id: string;
  content: ReactNode;
}

interface SplitBranch {
  type: "branch";
  id: string;
  direction: "horizontal" | "vertical";
  children: SplitNode[];
  ratios?: number[];
}

type SplitNode = SplitLeaf | SplitBranch;

export type { SplitBranch, SplitLeaf, SplitNode };

const DEFAULT_MIN_SIZE = 120;

function defaultRatios(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

function clampRatios(ratios: number[], minRatio: number): number[] {
  const clamped = ratios.map((r) => Math.max(r, minRatio));
  const total = clamped.reduce((sum, r) => sum + r, 0);
  return clamped.map((r) => r / total);
}

interface SplitContainerProps {
  root: SplitNode;
  minSize?: number;
  onRatiosChange?: (nodeId: string, ratios: number[]) => void;
}

export function SplitContainer({
  root,
  minSize = DEFAULT_MIN_SIZE,
  onRatiosChange,
}: SplitContainerProps) {
  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <SplitNodeRenderer
        node={root}
        minSize={minSize}
        onRatiosChange={onRatiosChange}
      />
    </div>
  );
}

interface SplitNodeRendererProps {
  node: SplitNode;
  minSize: number;
  onRatiosChange?: (nodeId: string, ratios: number[]) => void;
}

function SplitNodeRenderer({
  node,
  minSize,
  onRatiosChange,
}: SplitNodeRendererProps) {
  if (node.type === "leaf") {
    return <div className="flex flex-1 min-h-0 min-w-0">{node.content}</div>;
  }

  return (
    <BranchRenderer
      node={node}
      minSize={minSize}
      onRatiosChange={onRatiosChange}
    />
  );
}

interface BranchRendererProps {
  node: SplitBranch;
  minSize: number;
  onRatiosChange?: (nodeId: string, ratios: number[]) => void;
}

function BranchRenderer({
  node,
  minSize,
  onRatiosChange,
}: BranchRendererProps) {
  const { id, direction, children } = node;
  const isHorizontal = direction === "horizontal";

  const initialRatios = node.ratios ?? defaultRatios(children.length);
  const [internalRatios, setInternalRatios] = useState(initialRatios);

  const ratios =
    internalRatios.length === children.length
      ? internalRatios
      : defaultRatios(children.length);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(0);

  useEffect(
    function observeContainerSize() {
      const el = containerRef.current;
      if (!el) {
        return;
      }

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        const size = isHorizontal
          ? entry.contentRect.width
          : entry.contentRect.height;
        setContainerSize(size);
      });

      observer.observe(el);
      return () => observer.disconnect();
    },
    [isHorizontal],
  );

  const handleResize = useCallback(
    function handleResize(handleIndex: number, pixelDelta: number) {
      setInternalRatios((prev) => {
        if (containerSize === 0) {
          return prev;
        }

        const ratioDelta = pixelDelta / containerSize;
        const next = [...prev];
        next[handleIndex] += ratioDelta;
        next[handleIndex + 1] -= ratioDelta;

        const minRatio = minSize / containerSize;
        const clamped = clampRatios(next, minRatio);

        onRatiosChange?.(id, clamped);
        return clamped;
      });
    },
    [containerSize, minSize, id, onRatiosChange],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-1 min-h-0 min-w-0",
        isHorizontal ? "flex-row" : "flex-col",
      )}
    >
      {children.map((child, i) => (
        <PaneWithHandle
          key={child.id}
          index={i}
          isLast={i === children.length - 1}
          ratio={ratios[i]}
          direction={direction}
          containerSize={containerSize}
          onResize={handleResize}
        >
          <SplitNodeRenderer
            node={child}
            minSize={minSize}
            onRatiosChange={onRatiosChange}
          />
        </PaneWithHandle>
      ))}
    </div>
  );
}

interface PaneWithHandleProps {
  index: number;
  isLast: boolean;
  ratio: number;
  direction: "horizontal" | "vertical";
  containerSize: number;
  onResize: (handleIndex: number, pixelDelta: number) => void;
  children: ReactNode;
}

function PaneWithHandle({
  index,
  isLast,
  ratio,
  direction,
  containerSize,
  onResize,
  children,
}: PaneWithHandleProps) {
  const isHorizontal = direction === "horizontal";
  const style = isHorizontal
    ? { width: `${ratio * 100}%` }
    : { height: `${ratio * 100}%` };

  const handleResizeForIndex = useCallback(
    function handleResizeForIndex(pixelDelta: number) {
      onResize(index, pixelDelta);
    },
    [onResize, index],
  );

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 min-w-0",
          isHorizontal ? "flex-row" : "flex-col",
        )}
        style={style}
      >
        {children}
      </div>
      {!isLast && (
        <ResizeHandle
          direction={direction}
          containerSize={containerSize}
          onResize={handleResizeForIndex}
        />
      )}
    </>
  );
}

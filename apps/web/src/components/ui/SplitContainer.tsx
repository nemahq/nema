import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@nema-io/weave";

import type { ResizeDirection } from "./ResizeHandle";
import { ResizeHandle } from "./ResizeHandle";

interface SplitLeaf {
  type: "leaf";
  id: string;
  content: ReactNode;
}

interface SplitBranch {
  type: "branch";
  id: string;
  direction: ResizeDirection;
  children: [SplitNode, SplitNode, ...SplitNode[]];
  ratios?: number[];
}

type SplitNode = SplitLeaf | SplitBranch;

export type { SplitBranch, SplitLeaf, SplitNode };

const DEFAULT_MIN_SIZE = 120;

function defaultRatios(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
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
  const containerSizeRef = useRef(0);
  const [containerSize, setContainerSize] = useState(0);

  const ratiosRef = useRef(ratios);
  useEffect(function syncRatiosRef() {
    ratiosRef.current = ratios;
  });

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
        containerSizeRef.current = size;
        setContainerSize(size);
      });

      observer.observe(el);
      return () => observer.disconnect();
    },
    [isHorizontal],
  );

  const handleResize = useCallback(
    function handleResize(handleIndex: number, pixelDelta: number) {
      const currentSize = containerSizeRef.current;
      if (currentSize === 0) {
        return;
      }

      const prev = ratiosRef.current;
      const minRatio = minSize / currentSize;
      const ratioDelta = pixelDelta / currentSize;

      const maxDelta = prev[handleIndex + 1] - minRatio;
      const minDelta = -(prev[handleIndex] - minRatio);
      const clampedDelta = Math.max(minDelta, Math.min(maxDelta, ratioDelta));

      const next = [...prev];
      next[handleIndex] += clampedDelta;
      next[handleIndex + 1] -= clampedDelta;

      ratiosRef.current = next;
      setInternalRatios(next);
      onRatiosChange?.(id, next);
    },
    [minSize, id, onRatiosChange],
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
          ratio={ratios[i] ?? 1 / children.length}
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
  direction: ResizeDirection;
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

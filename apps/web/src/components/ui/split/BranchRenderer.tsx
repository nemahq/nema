import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@nema-io/weave";

import { PaneWithHandle } from "./PaneWithHandle";
import type { SplitBranch, SplitNode } from "./types";
import { defaultRatios } from "./types";

interface BranchRendererProps {
  node: SplitBranch;
  minSize: number;
  onRatiosChange?: (nodeId: string, ratios: number[]) => void;
  renderNode: (node: SplitNode) => ReactNode;
}

export function BranchRenderer({
  node,
  minSize,
  onRatiosChange,
  renderNode,
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
          {renderNode(child)}
        </PaneWithHandle>
      ))}
    </div>
  );
}

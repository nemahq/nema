import type { ReactNode } from "react";
import { useCallback } from "react";

import { cn } from "@nema-io/weave";

import { ResizeHandle } from "./ResizeHandle";
import type { ResizeDirection } from "./types";

interface PaneWithHandleProps {
  index: number;
  isLast: boolean;
  ratio: number;
  direction: ResizeDirection;
  containerSize: number;
  onResize: (handleIndex: number, pixelDelta: number) => void;
  children: ReactNode;
}

export function PaneWithHandle({
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

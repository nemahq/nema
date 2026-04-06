import { useRef, useState } from "react";

import { cn } from "@nema-io/weave";

export type DropPosition = "top" | "bottom" | "left" | "right" | "center";

const EDGE_THRESHOLD = 0.3;

function detectPosition(
  e: React.DragEvent,
  rect: DOMRect,
  disableEdges: boolean,
): DropPosition {
  if (disableEdges || rect.width === 0 || rect.height === 0) {
    return "center";
  }

  const relX = (e.clientX - rect.left) / rect.width;
  const relY = (e.clientY - rect.top) / rect.height;

  if (relY < EDGE_THRESHOLD) {
    return "top";
  }
  if (relY > 1 - EDGE_THRESHOLD) {
    return "bottom";
  }
  if (relX < EDGE_THRESHOLD) {
    return "left";
  }
  if (relX > 1 - EDGE_THRESHOLD) {
    return "right";
  }
  return "center";
}

const POSITION_STYLE: Record<DropPosition, string> = {
  top: "inset-x-0 top-0 h-1/2",
  bottom: "inset-x-0 bottom-0 h-1/2",
  left: "inset-y-0 left-0 w-1/2",
  right: "inset-y-0 right-0 w-1/2",
  center: "inset-0",
};

export function useDropZone(dragType: string, disableEdges: boolean) {
  const [activePosition, setActivePosition] = useState<DropPosition | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const dragEnterCountRef = useRef(0);

  function handleDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(dragType)) {
      return;
    }
    dragEnterCountRef.current += 1;
    if (dragEnterCountRef.current === 1) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setActivePosition(detectPosition(e, rect, disableEdges));
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(dragType)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setActivePosition(detectPosition(e, rect, disableEdges));
  }

  function handleDragLeave() {
    dragEnterCountRef.current -= 1;
    if (dragEnterCountRef.current <= 0) {
      dragEnterCountRef.current = 0;
      setActivePosition(null);
    }
  }

  function resetDrag() {
    dragEnterCountRef.current = 0;
    setActivePosition(null);
  }

  return {
    containerRef,
    activePosition,
    resetDrag,
    containerProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
    },
  };
}

interface DropZoneHighlightProps {
  activePosition: DropPosition | null;
}

export function DropZoneHighlight({ activePosition }: DropZoneHighlightProps) {
  if (!activePosition) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className={cn(
          "absolute bg-fg-primary/10 transition-all duration-fast",
          POSITION_STYLE[activePosition],
        )}
      />
    </div>
  );
}

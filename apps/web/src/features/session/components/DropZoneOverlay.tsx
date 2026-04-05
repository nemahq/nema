import { useCallback, useRef, useState } from "react";

import { cn } from "@nema-io/weave";

export type DropPosition = "top" | "bottom" | "left" | "right" | "center";

const EDGE_THRESHOLD = 0.25;

interface DropZoneOverlayProps {
  onDrop: (position: DropPosition, e: React.DragEvent) => void;
  disableEdges?: boolean;
}

function detectPosition(
  e: React.DragEvent,
  rect: DOMRect,
  disableEdges: boolean,
): DropPosition {
  if (disableEdges) {
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
  top: "inset-x-0 top-0 h-1/4",
  bottom: "inset-x-0 bottom-0 h-1/4",
  left: "inset-y-0 left-0 w-1/4",
  right: "inset-y-0 right-0 w-1/4",
  center: "inset-0",
};

export function DropZoneOverlay({
  onDrop,
  disableEdges = false,
}: DropZoneOverlayProps) {
  const [activePosition, setActivePosition] = useState<DropPosition | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragOver = useCallback(
    function handleDragOver(e: React.DragEvent) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setActivePosition(detectPosition(e, rect, disableEdges));
    },
    [disableEdges],
  );

  function handleDragLeave(e: React.DragEvent) {
    if (
      containerRef.current &&
      !containerRef.current.contains(e.relatedTarget as Node)
    ) {
      setActivePosition(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const position = detectPosition(e, rect, disableEdges);
    setActivePosition(null);
    onDrop(position, e);
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {activePosition && (
        <div
          className={cn(
            "absolute rounded bg-brand/15 transition-all duration-fast",
            POSITION_STYLE[activePosition],
          )}
        />
      )}
    </div>
  );
}

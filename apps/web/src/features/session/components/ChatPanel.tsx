import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 280;
const MAX_WIDTH_VW = 50;

export function ChatPanel({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startWidth = width;
      const maxWidth = window.innerWidth * (MAX_WIDTH_VW / 100);

      function onMouseMove(ev: MouseEvent) {
        if (!dragging.current) {
          return;
        }
        const delta = startX - ev.clientX;
        const next = Math.min(
          maxWidth,
          Math.max(MIN_WIDTH, startWidth + delta),
        );
        setWidth(next);
      }

      function onMouseUp() {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width],
  );

  return (
    <aside
      className="relative flex shrink-0 flex-col min-h-0 bg-surface-base"
      style={{ width }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize border-l border-border hover:border-brand active:border-brand"
      />

      {children}
    </aside>
  );
}

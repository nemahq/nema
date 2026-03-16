import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 280;
const MAX_WIDTH_RATIO = 0.5;

export function SidePanel({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startWidth = width;
      const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;

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

      function cleanup() {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        cleanupRef.current = null;
      }

      function onMouseUp() {
        cleanup();
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      cleanupRef.current = cleanup;
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

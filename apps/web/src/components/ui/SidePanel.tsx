import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";

const DEFAULT_WIDTH = 600;
// 280은 버튼 한 줄(취소/Organize)+Space pill이 밀리기 시작하는 폭이라
// 400으로 올렸다 — 기본값(600)의 2/3 수준이라 리사이즈 여지는 그대로 남는다.
const MIN_WIDTH = 400;
const MAX_WIDTH_RATIO = 0.5;

interface SidePanelProps {
  children: ReactNode;
  onClose?: () => void;
  // Sentry에서 이 바운더리를 구분할 태그 — 소비처마다 자기 컨텍스트를 넘긴다.
  boundaryName: string;
}

export function SidePanel({ children, onClose, boundaryName }: SidePanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(function cleanupOnUnmount() {
    return () => cleanupRef.current?.();
  }, []);

  useRegisterAction("sidePanel.close", {
    execute: () => onClose?.(),
    enabled: !!onClose,
  });

  function handleResizeStart(e: React.MouseEvent) {
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
      const next = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(next);
    }

    function cleanup() {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.documentElement.style.cursor = "";
      document.body.style.userSelect = "";
      document.documentElement.classList.remove("cursor-col-resize");
      cleanupRef.current = null;
    }

    function onMouseUp() {
      cleanup();
    }

    document.documentElement.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.documentElement.classList.add("cursor-col-resize");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    cleanupRef.current = cleanup;
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col min-h-0 bg-surface-card"
      style={{ width }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize border-l border-border/50 hover:border-l-2 hover:border-fg-tertiary/40 active:border-l-2 active:border-fg-secondary/60 dark:hover:border-fg-tertiary dark:active:border-fg-secondary"
      />

      <ErrorBoundary
        boundaryName={boundaryName}
        fallbackRender={(props) => <SectionErrorFallback {...props} />}
      >
        {children}
      </ErrorBoundary>
    </aside>
  );
}

import { useEffect, useRef } from "react";

import { cn } from "@nema-io/weave";

const KEYBOARD_STEP = 0.03;
const KEYBOARD_STEP_LARGE = 0.1;

export type ResizeDirection = "horizontal" | "vertical";

interface ResizeHandleProps {
  direction: ResizeDirection;
  /** 분할 방향의 컨테이너 크기 (px). 키보드 스텝 계산에 사용 */
  containerSize: number;
  /** 증분 픽셀 변화량. 포인터 드래그와 키보드 모두 이 콜백으로 통합 */
  onResize: (pixelDelta: number) => void;
}

export function ResizeHandle({
  direction,
  containerSize,
  onResize,
}: ResizeHandleProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const onResizeRef = useRef(onResize);

  useEffect(function syncOnResizeRef() {
    onResizeRef.current = onResize;
  });

  useEffect(function cleanupOnUnmount() {
    return () => cleanupRef.current?.();
  }, []);

  const isHorizontal = direction === "horizontal";
  const cursorStyle = isHorizontal ? "col-resize" : "row-resize";

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();

    let lastPos = isHorizontal ? e.clientX : e.clientY;

    function onPointerMove(ev: PointerEvent) {
      const currentPos = isHorizontal ? ev.clientX : ev.clientY;
      const delta = currentPos - lastPos;
      lastPos = currentPos;
      if (delta !== 0) {
        onResizeRef.current(delta);
      }
    }

    function cleanup() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cleanupRef.current = null;
    }

    function onPointerUp() {
      cleanup();
    }

    document.body.style.cursor = cursorStyle;
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    cleanupRef.current = cleanup;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const positiveKey = isHorizontal ? "ArrowRight" : "ArrowDown";
    const negativeKey = isHorizontal ? "ArrowLeft" : "ArrowUp";

    if (e.key !== positiveKey && e.key !== negativeKey) {
      return;
    }

    e.preventDefault();
    const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    const sign = e.key === positiveKey ? 1 : -1;
    onResize(sign * step * containerSize);
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- focusable separator = ARIA window splitter (interactive)
    <div
      role="separator"
      // aria-orientation은 구분선 자체의 방향: 수평 분할(좌우) 시 구분선은 수직
      aria-orientation={isHorizontal ? "vertical" : "horizontal"}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable separator = ARIA window splitter (interactive)
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative z-10 shrink-0 touch-none select-none",
        "before:absolute before:border-border/50 before:transition-colors before:duration-fast",
        "hover:before:border-brand active:before:border-brand",
        "focus-visible:before:border-brand focus-visible:outline-none",
        isHorizontal
          ? "w-0 cursor-col-resize before:inset-y-0 before:-left-px before:border-l -mx-1 px-1"
          : "h-0 cursor-row-resize before:inset-x-0 before:-top-px before:border-t -my-1 py-1",
      )}
    />
  );
}

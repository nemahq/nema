import { useEffect, useRef, useState } from "react";

const CHARS_PER_FRAME = 3;

/**
 * 네트워크 스트리밍의 불규칙한 도착 속도와 UI 렌더링을 분리하여
 * 끊김 없이 부드러운 텍스트 출력을 만든다.
 *
 * @param buffer - 계속 늘어나는 원본 텍스트. 빈 문자열을 넘기면 내부 상태가 리셋된다.
 */
export function useBufferedStream(buffer: string, enabled = true) {
  const [displayed, setDisplayed] = useState("");
  const posRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(
    function drainBuffer() {
      if (buffer === "") {
        posRef.current = 0;
        return;
      }

      if (!enabled) {
        return;
      }

      function tick() {
        if (posRef.current >= buffer.length) {
          return;
        }
        posRef.current = Math.min(
          posRef.current + CHARS_PER_FRAME,
          buffer.length,
        );
        setDisplayed(buffer.slice(0, posRef.current));
        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    },
    [buffer, enabled],
  );

  return buffer === "" ? "" : displayed;
}

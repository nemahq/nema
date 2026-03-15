import { useEffect, useRef, useState } from "react";

/**
 * 서버에서 불규칙하게 도착하는 스트리밍 토큰을 버퍼에 쌓아두고,
 * requestAnimationFrame으로 일정한 속도(글자당 CHARS_PER_FRAME)로
 * 화면에 풀어주는 훅. 네트워크 스트리밍과 UI 렌더링을 분리하여
 * 끊김 없이 부드러운 텍스트 출력을 만든다.
 */

const CHARS_PER_FRAME = 3;

export function useBufferedStream(buffer: string) {
  const [displayed, setDisplayed] = useState("");
  const posRef = useRef(0);
  const rafRef = useRef(0);
  const prevBufferRef = useRef(buffer);

  useEffect(
    function drainBuffer() {
      const wasReset = prevBufferRef.current !== "" && buffer === "";
      prevBufferRef.current = buffer;

      if (wasReset) {
        posRef.current = 0;
      }

      function tick() {
        if (posRef.current >= buffer.length) {
          if (wasReset) {
            setDisplayed("");
          }
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
    [buffer],
  );

  return displayed;
}

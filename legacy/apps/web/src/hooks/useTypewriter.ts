import { useEffect, useRef, useState } from "react";

const TYPEWRITER_SPEED_MS = 30;

export function useTypewriter(text: string | null) {
  const [displayed, setDisplayed] = useState(text ?? "");
  const prevTextRef = useRef(text);

  useEffect(
    function animateTypewriter() {
      const prev = prevTextRef.current;
      prevTextRef.current = text;

      if (prev !== null || text === null) {
        setDisplayed(text ?? "");
        return;
      }

      let i = 0;
      setDisplayed("");
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
        }
      }, TYPEWRITER_SPEED_MS);

      return () => clearInterval(interval);
    },
    [text],
  );

  return displayed;
}

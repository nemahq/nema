import { useLayoutEffect, useRef, useState } from "react";

export function useIsOverflowing<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(function observeOverflow() {
    const el = ref.current;
    if (!el) {
      return;
    }

    function measure() {
      if (!el) {
        return;
      }
      setIsOverflowing(el.scrollWidth > el.clientWidth);
    }

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  return { ref, isOverflowing };
}

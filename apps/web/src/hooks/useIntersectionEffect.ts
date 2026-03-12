import { type RefObject, useEffect } from "react";

export function useIntersectionEffect(
  ref: RefObject<Element | null>,
  callback: () => void,
  options?: { enabled?: boolean; rootMargin?: string },
) {
  const { enabled = true, rootMargin = "200px" } = options ?? {};

  useEffect(
    function observeIntersection() {
      const el = ref.current;
      if (!el || !enabled) return;

      const observer = new IntersectionObserver(
        function handleIntersection(entries) {
          if (entries[0]?.isIntersecting) {
            callback();
          }
        },
        { rootMargin },
      );

      observer.observe(el);
      return function cleanup() {
        observer.disconnect();
      };
    },
    [ref, callback, enabled, rootMargin],
  );
}

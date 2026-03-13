import { type RefObject, useEffect } from "react";

export function useIntersectionEffect({
  ref,
  onIntersect,
  enabled = true,
  rootMargin = "200px",
}: {
  ref: RefObject<Element | null>;
  onIntersect: () => void;
  enabled?: boolean;
  rootMargin?: string;
}) {
  useEffect(
    function observeIntersection() {
      const el = ref.current;
      if (!el || !enabled) {
        return;
      }

      const observer = new IntersectionObserver(
        function handleIntersection(entries) {
          if (entries[0]?.isIntersecting) {
            onIntersect();
          }
        },
        { rootMargin },
      );

      observer.observe(el);
      return function cleanup() {
        observer.disconnect();
      };
    },
    [ref, onIntersect, enabled, rootMargin],
  );
}

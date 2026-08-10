import { useLayoutEffect, useRef } from "react";

// 라우트 전환마다 스크롤 컨테이너가 언마운트/재마운트돼 컴포넌트 state로는
// 위치를 못 들고 다닌다 — 모듈 스코프 Map에 key별 scrollTop을 남겨 재마운트 시
// 복원한다(세션 중 유지로 충분해 sessionStorage 직렬화는 불필요).
const scrollPositions = new Map<string, number>();

export function useMainScrollRestoration(key: string) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(
    function restoreScrollPosition() {
      const maybeContainer = containerRef.current;
      if (!maybeContainer) {
        return;
      }
      const container: HTMLDivElement = maybeContainer;

      container.scrollTop = scrollPositions.get(key) ?? 0;

      function persistScrollPosition() {
        scrollPositions.set(key, container.scrollTop);
      }

      container.addEventListener("scroll", persistScrollPosition, {
        passive: true,
      });
      return function cleanup() {
        persistScrollPosition();
        container.removeEventListener("scroll", persistScrollPosition);
      };
    },
    [key],
  );

  return containerRef;
}

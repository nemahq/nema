import { type RefObject, useEffect } from "react";

// 고정 px(이전 값 200px)는 관성 스크롤에서 리드가 0.1초 남짓이라 다음 페이지가
// 도착하기 전에 목록 끝에 닿는다. 뷰포트 비율로 두면 스크롤 속도·화면 크기와
// 무관하게 한 화면 분량의 여유가 유지된다.
const ROOT_MARGIN_DEFAULT = "100% 0px";

export function useIntersectionEffect({
  ref,
  onIntersect,
  enabled = true,
  rootMargin = ROOT_MARGIN_DEFAULT,
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

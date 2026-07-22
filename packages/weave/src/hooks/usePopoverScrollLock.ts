import { useCallback, useRef } from "react";

// body 대신 "이 팝오버 콘텐츠 안에서 난 스크롤인가"만 본다 — 실제 스크롤 컨테이너가
// body가 아닌 경우가 흔하고(portal로 뜨는 팝오버 입장에선 그게 뭔지 알 방법이 없다),
// 팝오버 자신의 내부 스크롤(검색 결과 목록 등)은 항상 허용해야 한다.
//
// useEffect가 아니라 콜백 ref로 여닫는다 — 이 훅을 쓰는 PopoverContent 자신은
// 팝오버가 닫혀 있어도 부모가 렌더될 때마다 항상 마운트된다(실제로 열릴 때만
// 나타나는 건 그 안쪽 Radix 콘텐츠 DOM 노드뿐). useEffect에 걸면 닫힌 상태에서도
// 리스너가 상시 걸리고, 그때 ref는 아직 null이라 "안이면 허용" 판정이 항상
// 실패해 모든 스크롤이 막힌다.
export function usePopoverScrollLock<T extends HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback(function attachOrDetach(node: T | null) {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) {
      return;
    }
    // 널 체크 좁히기는 중첩 함수 클로저까지 안 이어지므로 별도 상수로 고정한다.
    const content = node;

    function blockOutsideScroll(event: WheelEvent | TouchEvent) {
      if (event.target instanceof Node && content.contains(event.target)) {
        return;
      }
      event.preventDefault();
    }

    document.addEventListener("wheel", blockOutsideScroll, {
      passive: false,
    });
    document.addEventListener("touchmove", blockOutsideScroll, {
      passive: false,
    });
    cleanupRef.current = function unlockScroll() {
      document.removeEventListener("wheel", blockOutsideScroll);
      document.removeEventListener("touchmove", blockOutsideScroll);
    };
  }, []);
}

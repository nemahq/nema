import { useLayoutEffect, useRef } from "react";

// body.style.overflow를 잠그는 방식은 이 라이브러리 레벨에서 못 쓴다 — 실제로
// 스크롤되는 요소가 body가 아니라 소비 앱의 레이아웃 내부 컨테이너인 경우가
// 흔하고(portal로 뜨는 팝오버 입장에서 그게 뭔지 알 방법이 없다), body를 잠가도
// 그 안쪽 컨테이너는 그대로 스크롤된다. 대신 "이 팝오버 콘텐츠 안에서 난 휠·터치
// 스크롤인가"만 보고 아니면 막는다 — 팝오버 자신의 내부 스크롤(예: 검색 결과
// 목록)은 항상 허용되고, 그 바깥은 어떤 컨테이너든 전부 막힌다. 중첩 팝오버는
// 각자 자기 range만 허용하므로, 안쪽이 열려 있는 동안 바깥 팝오버의 콘텐츠도
// (안쪽 콘텐츠 밖이라) 함께 잠기는 게 자연스러운 결과다.
export function usePopoverScrollLock<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(function lockScroll() {
    function blockOutsideScroll(event: WheelEvent | TouchEvent) {
      const content = ref.current;
      if (
        content &&
        event.target instanceof Node &&
        content.contains(event.target)
      ) {
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
    return function unlockScroll() {
      document.removeEventListener("wheel", blockOutsideScroll);
      document.removeEventListener("touchmove", blockOutsideScroll);
    };
  }, []);

  return ref;
}

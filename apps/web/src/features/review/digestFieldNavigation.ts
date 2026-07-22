// 커서가 뷰포트 가장자리에 완전히 닿아야 스크롤이 따라가면 그 순간 홱 튀는
// 느낌이 난다 — 닿기 전 이만큼 남았을 때부터 미리 따라가게 한다.
const SCROLL_EDGE_MARGIN_PX = 24;

// 마운트 시점 등록 대신 누른 순간 DOM을 훑는다 — 접힌 카드의 필드는 순회에서
// 저절로 빠지고, 새 필드도 data-nav-field만 붙이면 등록 코드 없이 합류한다.
function focusAdjacentNavField(
  current: HTMLTextAreaElement,
  direction: "up" | "down",
) {
  const fields = Array.from(
    document.querySelectorAll<HTMLTextAreaElement>(
      "[data-nav-field]:not(:disabled)",
    ),
  );
  const currentIndex = fields.indexOf(current);
  const target = fields[currentIndex + (direction === "up" ? -1 : 1)];
  if (currentIndex === -1 || !target) {
    return;
  }
  // 브라우저 기본 auto-scroll은 sticky 헤더에 가려지는 걸 모르고 "거의 다 왔을 때
  // 미리" 같은 여유도 못 줘서, 직접 계산해 대체한다.
  target.focus({ preventScroll: true });
  const cursor = direction === "up" ? target.value.length : 0;
  target.setSelectionRange(cursor, cursor);

  const scrollArea = document.querySelector<HTMLElement>(
    "[data-main-scroll-area]",
  );
  if (!scrollArea) {
    return;
  }
  const header = document.querySelector<HTMLElement>("[data-sticky-header]");
  const areaRect = scrollArea.getBoundingClientRect();
  const topBound =
    (header?.getBoundingClientRect().bottom ?? areaRect.top) +
    SCROLL_EDGE_MARGIN_PX;
  const bottomBound = areaRect.bottom - SCROLL_EDGE_MARGIN_PX;
  const targetRect = target.getBoundingClientRect();
  if (targetRect.top < topBound) {
    scrollArea.scrollTop -= topBound - targetRect.top;
  } else if (targetRect.bottom > bottomBound) {
    scrollArea.scrollTop += targetRect.bottom - bottomBound;
  }
}

// 여러 줄 필드 안에서 줄바꿈하며 편집할 때 방향키를 뺏기면 안 되므로, 커서가
// 필드의 절대 시작/끝에 있을 때만 다음 필드로 탈출한다 — 첫 줄 중간이면 브라우저
// 기본 동작이 먼저 먹고, 다시 누르면 그때 탈출한다(Notion 블록 이동과 같은 2단
// 동작). 처리했으면 true.
export function handleBoundaryArrowKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
): boolean {
  if (e.shiftKey) {
    return false;
  }
  const el = e.currentTarget;
  if (e.key === "ArrowUp" && el.selectionStart === 0 && el.selectionEnd === 0) {
    e.preventDefault();
    focusAdjacentNavField(el, "up");
    return true;
  }
  if (
    e.key === "ArrowDown" &&
    el.selectionStart === el.value.length &&
    el.selectionEnd === el.value.length
  ) {
    e.preventDefault();
    focusAdjacentNavField(el, "down");
    return true;
  }
  return false;
}

import { useRef } from "react";

// Radix는 팝오버류(DropdownMenu/Select)가 닫힐 때 트리거로 포커스를 되돌리는데,
// 이 프로그래매틱 focus가 마우스로 닫힌 모든 경우(바깥 클릭, 아이템 선택)에도
// focus-visible 링을 띄운다 — 실제 키보드로 닫은 경우(Escape)만 재포커스를 허용해
// 트리거를 쓰는 쪽마다 이 판단을 반복하지 않게 한다.
export function useEscapeAwareCloseFocus(
  onEscapeKeyDown?: (event: KeyboardEvent) => void,
  onCloseAutoFocus?: (event: Event) => void,
) {
  const closedViaEscapeRef = useRef(false);

  return {
    onEscapeKeyDown: (event: KeyboardEvent) => {
      closedViaEscapeRef.current = true;
      onEscapeKeyDown?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      if (!closedViaEscapeRef.current) {
        event.preventDefault();
      }
      closedViaEscapeRef.current = false;
      onCloseAutoFocus?.(event);
    },
  };
}

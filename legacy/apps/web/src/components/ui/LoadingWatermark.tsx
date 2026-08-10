import { usePendingAfterDelay } from "@web/hooks/usePendingAfterDelay";

import { Watermark } from "./Watermark";

// 마운트되는 시점 자체가 "로딩 시작"이라는 신호라 별도 isLoading prop이 필요 없다 —
// 소비처가 이미 자기 로딩 조건 안에서만 이 컴포넌트를 렌더한다. 짧게 끝나는 로딩엔
// 반짝이고 지나가지 않도록, delay를 넘겨야만 Watermark가 나타난다.
export function LoadingWatermark() {
  const showWatermark = usePendingAfterDelay(true);

  if (!showWatermark) {
    return null;
  }

  return <Watermark />;
}

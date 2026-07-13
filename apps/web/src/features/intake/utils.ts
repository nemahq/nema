import type { PendingSourceItem } from "@web/features/intake/types";

export type DraftStatus = "processing" | "cancelled" | "failed" | "empty";

// 리뷰가 열린(reviewChangesetId 있음) Source는 이미 초안을 벗어나 변경셋 대기로
// 넘어간 상태라 null을 반환한다 — surface-inventory.md "초안" 참고. 판정을 여기 한
// 곳에 모아둬서, 호출부가 "먼저 필터링부터"라는 순서를 따로 기억하지 않아도 된다.
export function draftStatus(source: PendingSourceItem): DraftStatus | null {
  if (source.reviewChangesetId !== null) {
    return null;
  }
  switch (source.digestionStatus) {
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    case "completed":
      return "empty";
    case "pending":
      return "processing";
    default: {
      // 5번째 digestion_status 값이 추가돼도 "처리 중"(가장 파괴적인 기본값 — 액션
      // 잠금)으로 조용히 매핑되지 않도록, 모르는 값은 초안이 아닌 것으로 취급한다.
      const exhaustive: never = source.digestionStatus;
      void exhaustive;
      return null;
    }
  }
}

export function isDraftItem(source: PendingSourceItem): boolean {
  return draftStatus(source) !== null;
}

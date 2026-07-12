import type { PendingSourceItem } from "@web/features/intake/types";

export type DraftStatus = "processing" | "failed" | "empty";

// 리뷰가 열린(reviewChangesetId 있음) Source는 이미 초안을 벗어나 변경셋 대기로
// 넘어간 상태라 null을 반환한다 — surface-inventory.md "초안" 참고. 판정을 여기 한
// 곳에 모아둬서, 호출부가 "먼저 필터링부터"라는 순서를 따로 기억하지 않아도 된다.
export function draftStatus(source: PendingSourceItem): DraftStatus | null {
  if (source.reviewChangesetId !== null) {
    return null;
  }
  if (source.digestionStatus === "failed") {
    return "failed";
  }
  if (source.digestionStatus === "completed") {
    return "empty";
  }
  return "processing";
}

export function isDraftItem(source: PendingSourceItem): boolean {
  return draftStatus(source) !== null;
}

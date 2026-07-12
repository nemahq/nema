import type { PendingSourceItem } from "@web/features/intake/types";

export type DraftStatus = "processing" | "failed" | "empty";

// 리뷰가 열린(reviewChangesetId 있음) Source는 이미 초안을 벗어나 변경셋 대기로
// 넘어간 상태라 이 화면에 안 보인다 — surface-inventory.md "초안" 참고.
export function isDraftItem(item: PendingSourceItem): boolean {
  return item.reviewChangesetId === null;
}

export function draftStatus(item: PendingSourceItem): DraftStatus {
  if (item.digestionStatus === "failed") {
    return "failed";
  }
  if (item.digestionStatus === "completed") {
    return "empty";
  }
  return "processing";
}

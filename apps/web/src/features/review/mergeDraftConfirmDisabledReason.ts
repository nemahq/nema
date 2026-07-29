import type { DigestDraft } from "@nema-io/shared";

export type MergeDraftConfirmDisabledReason =
  | "no_draft"
  | "missing_title"
  | "missing_description"
  | null;

// DigestDraftSchema의 title·description은 서버에서 min(1)이라, 빈 채로 확정을
// 누르면 zod 검증 에러가 원문 그대로 토스트에 뜬다(confirmReviewFlow.ts의
// missing_title/missing_description과 같은 문제) — 여기서 먼저 막아 그 실패
// 경로 자체를 없앤다.
export function mergeDraftConfirmDisabledReason(
  draft: DigestDraft | null,
): MergeDraftConfirmDisabledReason {
  if (!draft) {
    return "no_draft";
  }
  if (draft.title.trim() === "") {
    return "missing_title";
  }
  if (draft.description.trim() === "") {
    return "missing_description";
  }
  return null;
}

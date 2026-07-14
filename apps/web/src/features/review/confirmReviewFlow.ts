import type { ReviewDigest, ReviewNewReference } from "./types";

type ConfirmDisabledReason = "no_candidates" | "missing_title" | null;

export function confirmDisabledReason(
  hasCandidates: boolean,
  hasEmptyTitle: boolean,
): ConfirmDisabledReason {
  if (!hasCandidates) {
    return "no_candidates";
  }
  return hasEmptyTitle ? "missing_title" : null;
}

interface ConfirmReviewFlowArgs {
  changesetId: string;
  dirty: boolean;
  digestRows: { digest: ReviewDigest; title: string }[];
  newReferences: ReviewNewReference[];
  updateReview: (payload: {
    changesetId: string;
    digests: ReviewDigest[];
    newReferences: ReviewNewReference[];
  }) => Promise<unknown>;
  confirmReview: (payload: { changesetId: string }) => Promise<unknown>;
}

// 편집한 내용을 먼저 저장해야만 확정한다 — 순서가 바뀌면(예: 확정을 먼저 부르고
// 저장 실패를 무시) "편집 실패했는데 확정은 성공"이라는 조용한 회귀가 된다.
// updateReview가 reject하면 confirmReview는 아예 호출되지 않는다.
export async function runConfirmReview(
  args: ConfirmReviewFlowArgs,
): Promise<void> {
  const {
    changesetId,
    dirty,
    digestRows,
    newReferences,
    updateReview,
    confirmReview,
  } = args;

  if (dirty) {
    await updateReview({
      changesetId,
      digests: digestRows.map(({ digest, title }) => ({
        ...digest,
        title: title.trim(),
      })),
      newReferences,
    });
  }
  await confirmReview({ changesetId });
}

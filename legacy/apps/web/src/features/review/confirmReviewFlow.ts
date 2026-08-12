type ConfirmDisabledReason =
  | "no_candidates"
  | "missing_title"
  | "missing_description"
  | "empty_label"
  | "empty_reference"
  | null;

interface ConfirmDisabledInput {
  hasCandidates: boolean;
  hasEmptyTitle: boolean;
  hasEmptyDescription: boolean;
  hasEmptyLabel: boolean;
  hasEmptyReference: boolean;
}

export function confirmDisabledReason(
  input: ConfirmDisabledInput,
): ConfirmDisabledReason {
  const {
    hasCandidates,
    hasEmptyTitle,
    hasEmptyDescription,
    hasEmptyLabel,
    hasEmptyReference,
  } = input;
  if (!hasCandidates) {
    return "no_candidates";
  }
  if (hasEmptyTitle) {
    return "missing_title";
  }
  if (hasEmptyDescription) {
    return "missing_description";
  }
  if (hasEmptyLabel) {
    return "empty_label";
  }
  return hasEmptyReference ? "empty_reference" : null;
}

interface ConfirmReviewFlowArgs {
  changesetId: string;
  // 초안은 이제 자동 저장이 상시 담당한다 — confirm은 그 결과를 조립·전송하지 않고,
  // 아직 안 끝난 저장(디바운스 대기·전송 중)이 있으면 끝날 때까지 기다리기만 한다.
  flushPendingSave: () => Promise<void>;
  confirmReview: (payload: { changesetId: string }) => Promise<unknown>;
}

// 편집한 내용을 먼저 저장해야만 확정한다 — 순서가 바뀌면(예: 확정을 먼저 부르고
// 저장 실패를 무시) "편집 실패했는데 확정은 성공"이라는 조용한 회귀가 된다.
// flushPendingSave가 reject하면 confirmReview는 아예 호출되지 않는다.
export async function runConfirmReview(
  args: ConfirmReviewFlowArgs,
): Promise<void> {
  const { changesetId, flushPendingSave, confirmReview } = args;

  await flushPendingSave();
  await confirmReview({ changesetId });
}

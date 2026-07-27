import type { ReferenceMergeUpdate } from "@nema-io/shared";

import type { ReviewDraft } from "./reviewDraft";
import type { ReviewDigest, ReviewNewReference } from "./types";

type ConfirmDisabledReason =
  | "no_candidates"
  | "missing_title"
  | "missing_description"
  | "empty_label"
  | "empty_reference"
  | null;

export function confirmDisabledReason(
  hasCandidates: boolean,
  hasEmptyTitle: boolean,
  hasEmptyDescription: boolean,
  hasEmptyLabel: boolean,
  hasEmptyReference: boolean,
): ConfirmDisabledReason {
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
  draft: ReviewDraft;
  dirty: boolean;
  referenceUpdates: ReferenceMergeUpdate[];
  updateReview: (payload: {
    changesetId: string;
    expectedVersion: number;
    digests: ReviewDigest[];
    newReferences: ReviewNewReference[];
    referenceUpdates: ReferenceMergeUpdate[];
  }) => Promise<unknown>;
  confirmReview: (payload: { changesetId: string }) => Promise<unknown>;
}

// 초안을 그대로 실어 보내되 앞뒤 공백만 다듬는다 — 타이핑 중에 trim하면 띄어쓰기
// 자체를 칠 수 없어 초안에는 사람이 친 그대로 남기고, 서버로 나가는 이 순간에만
// 정규화한다.
function trimDigests(digests: ReviewDigest[]): ReviewDigest[] {
  return digests.map((digest) => ({
    ...digest,
    title: digest.title.trim(),
    description: digest.description.trim(),
    topics: digest.topics.map((topic) => ({
      ...topic,
      title: topic.title.trim(),
    })),
    tags: digest.tags.map((tag) => ({ ...tag, title: tag.title.trim() })),
  }));
}

// 편집한 내용을 먼저 저장해야만 확정한다 — 순서가 바뀌면(예: 확정을 먼저 부르고
// 저장 실패를 무시) "편집 실패했는데 확정은 성공"이라는 조용한 회귀가 된다.
// updateReview가 reject하면 confirmReview는 아예 호출되지 않는다.
export async function runConfirmReview(
  args: ConfirmReviewFlowArgs,
): Promise<void> {
  const { draft, dirty, referenceUpdates, updateReview, confirmReview } = args;

  if (dirty) {
    await updateReview({
      changesetId: draft.changesetId,
      expectedVersion: draft.draftVersion,
      digests: trimDigests(draft.digests),
      newReferences: draft.newReferences.map((reference) => ({
        ...reference,
        title: reference.title.trim(),
        body: reference.body.trim(),
      })),
      referenceUpdates: referenceUpdates.map((update) => ({
        ...update,
        mergeNote: update.mergeNote.trim(),
      })),
    });
  }
  await confirmReview({ changesetId: draft.changesetId });
}

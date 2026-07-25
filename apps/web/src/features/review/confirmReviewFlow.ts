import type { ReferenceMergeUpdate } from "@nema-io/shared";

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
  changesetId: string;
  dirty: boolean;
  digestRows: {
    digest: ReviewDigest;
    title: string;
    description: string;
    body: ReviewDigest["body"];
    topics: ReviewDigest["topics"];
    tags: ReviewDigest["tags"];
  }[];
  newReferences: ReviewNewReference[];
  referenceUpdates: ReferenceMergeUpdate[];
  updateReview: (payload: {
    changesetId: string;
    digests: ReviewDigest[];
    newReferences: ReviewNewReference[];
    referenceUpdates: ReferenceMergeUpdate[];
  }) => Promise<unknown>;
  confirmReview: (payload: { changesetId: string }) => Promise<unknown>;
  // 저장이 성공한 직후 로컬 편집 상태를 버리는 콜백. 저장 RPC가 changes를 전량
  // 재삽입해 digests 순서가 다시 섞이는데, 인덱스로 키를 잡은 override를 남겨두면
  // 확정이 실패해 화면에 머무를 때 다른 후보에 붙는다.
  onSaved: () => void;
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
    referenceUpdates,
    updateReview,
    confirmReview,
    onSaved,
  } = args;

  if (dirty) {
    await updateReview({
      changesetId,
      digests: digestRows.map(
        ({ digest, title, description, body, topics, tags }) => ({
          ...digest,
          title: title.trim(),
          description: description.trim(),
          body,
          topics: topics.map((topic) => ({
            ...topic,
            name: topic.name.trim(),
          })),
          tags: tags.map((tag) => ({ ...tag, title: tag.title.trim() })),
        }),
      ),
      newReferences: newReferences.map((reference) => ({
        ...reference,
        title: reference.title.trim(),
        body: reference.body.trim(),
      })),
      referenceUpdates: referenceUpdates.map((update) => ({
        ...update,
        mergeNote: update.mergeNote.trim(),
      })),
    });
    onSaved();
  }
  await confirmReview({ changesetId });
}

import {
  selectMergeCandidates,
  toReferenceUpdates,
} from "@web/features/review/referenceMerge";
import type { ReviewDraft } from "@web/features/review/reviewDraft";

// 초안 하나에서 확정 차단 조건과 저장 페이로드를 뽑는다 — React를 몰라도 되는 순수
// 계산이라 화면에서 떼어 직접 테스트한다.
export function computeReviewEditingState(draft: ReviewDraft) {
  const mergeCandidates = selectMergeCandidates({
    citedReferences: draft.citedReferences,
    citedReferenceIds: new Set(
      draft.digests.flatMap((digest) => digest.referenceIds),
    ),
  });

  const hasCandidates = draft.digests.length + draft.newReferences.length > 0;
  const hasEmptyTitle = draft.digests.some(
    (digest) => digest.title.trim() === "",
  );
  const hasEmptyDescription = draft.digests.some(
    (digest) => digest.description.trim() === "",
  );
  const hasEmptyLabel =
    draft.labelDraft.topics.some((topic) => topic.title.trim() === "") ||
    draft.labelDraft.tags.some((tag) => tag.title.trim() === "");
  // 신규 Reference 이름·설명, 기존 Reference 병합 설명 모두 필수(zod min(1)) — 비우면
  // 확정 시 원문 에러가 새므로 라벨 공백과 같은 결로 사전 차단한다.
  const hasEmptyReference =
    draft.newReferences.some(
      (reference) =>
        reference.title.trim() === "" || reference.body.trim() === "",
    ) || mergeCandidates.some((reference) => reference.mergeNote.trim() === "");

  return {
    hasCandidates,
    hasEmptyTitle,
    hasEmptyDescription,
    hasEmptyLabel,
    hasEmptyReference,
    referenceUpdates: toReferenceUpdates(mergeCandidates),
  };
}

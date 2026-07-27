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
  draft: ReviewDraft;
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

// 제목·설명·라벨(topics·tags)만 trim한다 — 이 필드들만 hasEmptyXxx로 공백을 확정
// 차단 조건으로 검사하므로, 저장 직전 trim해야 그 검사와 실제로 저장되는 값이
// 일치한다. body는 필드마다 optional이라 공백도 유효한 값으로 보고 trim하지
// 않는다(서버 DigestBodySchema도 마찬가지 — trim·min(1) 없음).
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
//
// dirty 무관하게 항상 updateReview를 태운다 — 예전엔 편집이 없으면 건너뛰었지만,
// 편집 여부를 추적하는 값이 초안(쿼리 캐시, 화면을 나가도 살아있음)보다 수명이
// 짧은 화면 상태였던 탓에 "편집 → 이탈 → 복귀 → 확정"에서 화면엔 편집분이 보여도
// 그 값이 저장 없이 버려지는 조용한 데이터 유실이 있었다. 초안 자체가 이미 전체
// 페이로드라 매번 보내도 멱등하다.
export async function runConfirmReview(
  args: ConfirmReviewFlowArgs,
): Promise<void> {
  const { draft, referenceUpdates, updateReview, confirmReview } = args;

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
  await confirmReview({ changesetId: draft.changesetId });
}

import {
  buildMergeRows,
  toReferenceUpdates,
} from "@web/features/review/referenceMerge";
import type {
  DigestReviewDetail,
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";

export interface ReviewOverrides {
  removedDigestIndexes: Set<number>;
  titleOverrides: Map<number, string>;
  bodyOverrides: Map<number, ReviewDigest["body"]>;
  topicsOverrides: Map<number, ReviewDigest["topics"]>;
  tagsOverrides: Map<number, ReviewDigest["tags"]>;
  removedReferenceKeys: Set<string>;
  referenceOverrides: Map<string, ReviewNewReference>;
  mergeNoteOverrides: Map<string, string>;
}

// reviewEditingStore의 파생 로직 — React를 몰라도 되는 순수 계산이라 store에서 떼어
// 직접 테스트한다.
export function computeReviewEditingState(
  review: DigestReviewDetail,
  overrides: ReviewOverrides,
) {
  const {
    removedDigestIndexes,
    titleOverrides,
    bodyOverrides,
    topicsOverrides,
    tagsOverrides,
    removedReferenceKeys,
    referenceOverrides,
    mergeNoteOverrides,
  } = overrides;

  const digestRows = review.digests
    .map((digest, index) => ({
      digest,
      index,
      title: titleOverrides.get(index) ?? digest.title,
      body: bodyOverrides.get(index) ?? digest.body,
      topics: topicsOverrides.get(index) ?? digest.topics,
      tags: tagsOverrides.get(index) ?? digest.tags,
    }))
    .filter((row) => !removedDigestIndexes.has(row.index));
  const referenceRows = review.newReferences
    .filter((reference) => !removedReferenceKeys.has(reference.key))
    .map((reference) => referenceOverrides.get(reference.key) ?? reference);
  const mergeRows = buildMergeRows({
    citedReferences: review.citedReferences,
    citedReferenceIds: new Set(
      digestRows.flatMap((row) => row.digest.referenceIds),
    ),
    mergeNoteOverrides,
  });

  const dirty =
    removedDigestIndexes.size > 0 ||
    titleOverrides.size > 0 ||
    bodyOverrides.size > 0 ||
    topicsOverrides.size > 0 ||
    tagsOverrides.size > 0 ||
    removedReferenceKeys.size > 0 ||
    referenceOverrides.size > 0 ||
    mergeNoteOverrides.size > 0;
  const hasCandidates = digestRows.length + referenceRows.length > 0;
  const hasEmptyTitle = digestRows.some((row) => row.title.trim() === "");
  const hasEmptyLabel = digestRows.some(
    (row) =>
      row.topics.some((topic) => topic.name.trim() === "") ||
      row.tags.some((tag) => tag.title.trim() === ""),
  );
  // 신규 Reference 이름·설명, 기존 Reference 병합 설명 모두 필수(zod min(1)) — 비우면
  // 확정 시 원문 에러가 새므로 라벨 공백과 같은 결로 사전 차단한다.
  const hasEmptyReference =
    referenceRows.some(
      (reference) =>
        reference.title.trim() === "" || reference.body.trim() === "",
    ) || mergeRows.some((row) => row.mergeNote.trim() === "");
  const referenceUpdates = toReferenceUpdates(mergeRows);

  return {
    digestRows,
    referenceRows,
    mergeRows,
    dirty,
    hasCandidates,
    hasEmptyTitle,
    hasEmptyLabel,
    hasEmptyReference,
    referenceUpdates,
  };
}

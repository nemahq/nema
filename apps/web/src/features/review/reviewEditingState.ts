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
  removedDigestIds: ReadonlySet<string>;
  titleOverrides: ReadonlyMap<string, string>;
  descriptionOverrides: ReadonlyMap<string, string>;
  bodyOverrides: ReadonlyMap<string, ReviewDigest["body"]>;
  topicsOverrides: ReadonlyMap<string, ReviewDigest["topics"]>;
  tagsOverrides: ReadonlyMap<string, ReviewDigest["tags"]>;
  removedReferenceIds: ReadonlySet<string>;
  referenceOverrides: ReadonlyMap<string, ReviewNewReference>;
  mergeNoteOverrides: ReadonlyMap<string, string>;
}

// reviewEditingStore의 파생 로직 — React를 몰라도 되는 순수 계산이라 store에서 떼어
// 직접 테스트한다.
export function computeReviewEditingState(
  review: DigestReviewDetail,
  overrides: ReviewOverrides,
) {
  const {
    removedDigestIds,
    titleOverrides,
    descriptionOverrides,
    bodyOverrides,
    topicsOverrides,
    tagsOverrides,
    removedReferenceIds,
    referenceOverrides,
    mergeNoteOverrides,
  } = overrides;

  const digestRows = review.digests
    .map((digest) => ({
      digest,
      title: titleOverrides.get(digest.id) ?? digest.title,
      description: descriptionOverrides.get(digest.id) ?? digest.description,
      body: bodyOverrides.get(digest.id) ?? digest.body,
      topics: topicsOverrides.get(digest.id) ?? digest.topics,
      tags: tagsOverrides.get(digest.id) ?? digest.tags,
      // 이 화면엔 digest 본문에서 인용 하나만 콕 집어 떼는 UI가 없다(엔진이 추출
      // 시점에 붙인 것이라 사람이 만든 게 아님) — 그래서 신규 Reference 후보를
      // 지우는 것 자체를 "이 인용도 없던 걸로"라는 의도로 본다. 안 지우면
      // 저장 시 서버가 존재하지 않는 인용이라며 원문 zod 에러로 거절한다.
      newReferenceKeys: digest.newReferenceKeys.filter(
        (key) => !removedReferenceIds.has(key),
      ),
    }))
    .filter((row) => !removedDigestIds.has(row.digest.id));
  const referenceRows = review.newReferences
    .filter((reference) => !removedReferenceIds.has(reference.id))
    .map((reference) => referenceOverrides.get(reference.id) ?? reference);
  const mergeRows = buildMergeRows({
    citedReferences: review.citedReferences,
    citedReferenceIds: new Set(
      digestRows.flatMap((row) => row.digest.referenceIds),
    ),
    mergeNoteOverrides,
  });

  const dirty =
    removedDigestIds.size > 0 ||
    titleOverrides.size > 0 ||
    descriptionOverrides.size > 0 ||
    bodyOverrides.size > 0 ||
    topicsOverrides.size > 0 ||
    tagsOverrides.size > 0 ||
    removedReferenceIds.size > 0 ||
    referenceOverrides.size > 0 ||
    mergeNoteOverrides.size > 0;
  const hasCandidates = digestRows.length + referenceRows.length > 0;
  const hasEmptyTitle = digestRows.some((row) => row.title.trim() === "");
  const hasEmptyDescription = digestRows.some(
    (row) => row.description.trim() === "",
  );
  const hasEmptyLabel = digestRows.some(
    (row) =>
      row.topics.some((topic) => topic.title.trim() === "") ||
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
    hasEmptyDescription,
    hasEmptyLabel,
    hasEmptyReference,
    referenceUpdates,
  };
}

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
  removedDigestIndexes: ReadonlySet<number>;
  titleOverrides: ReadonlyMap<number, string>;
  descriptionOverrides: ReadonlyMap<number, string>;
  bodyOverrides: ReadonlyMap<number, ReviewDigest["body"]>;
  topicsOverrides: ReadonlyMap<number, ReviewDigest["topics"]>;
  tagsOverrides: ReadonlyMap<number, ReviewDigest["tags"]>;
  // 태그·주제 이름 수정은 카드 하나가 아니라 그 id를 쓰는 모든 Digest에 영향을
  // 준다 — index로 키를 잡는 위 overrides로는 표현이 안 돼(트리거한 카드만
  // 갱신되고 나머지는 옛 이름인 채로 confirm 페이로드에 실린다: 서버가 이름으로
  // find-or-create하므로 옛 이름의 태그가 조용히 부활한다) id로 따로 키를 잡는다.
  tagRenames: ReadonlyMap<string, { title: string; description: string }>;
  topicRenames: ReadonlyMap<string, string>;
  removedReferenceKeys: ReadonlySet<string>;
  referenceOverrides: ReadonlyMap<string, ReviewNewReference>;
  mergeNoteOverrides: ReadonlyMap<string, string>;
}

// tagsOverrides/topicsOverrides(카드별) 위에 tagRenames/topicRenames(전역, id
// 기준)를 한 번 더 얹는다 — 어느 digest가 편집으로 override를 갖고 있든 아니든
// 상관없이, 이름이 바뀐 태그·주제는 그 id를 쓰는 모든 곳에서 똑같이 보여야 한다.
// 이 태그를 안 쓰는 Digest는 원래 배열 참조를 그대로 돌려준다 — renames에 아무거나
// 하나만 들어있어도 매번 새 배열을 만들면, 그 태그와 무관한 Digest까지 리렌더된다
// (store 구독 셀렉터라 참조가 바뀌면 리렌더로 이어진다).
export function applyTagRenames(
  tags: ReviewDigest["tags"],
  renames: ReadonlyMap<string, { title: string; description: string }>,
): ReviewDigest["tags"] {
  if (renames.size === 0) {
    return tags;
  }
  let changed = false;
  const next = tags.map((tag) => {
    const renamed = tag.id === null ? undefined : renames.get(tag.id);
    if (!renamed) {
      return tag;
    }
    changed = true;
    return { ...tag, ...renamed };
  });
  return changed ? next : tags;
}

export function applyTopicRenames(
  topics: ReviewDigest["topics"],
  renames: ReadonlyMap<string, string>,
): ReviewDigest["topics"] {
  if (renames.size === 0) {
    return topics;
  }
  let changed = false;
  const next = topics.map((topic) => {
    const renamed = topic.id === null ? undefined : renames.get(topic.id);
    if (!renamed) {
      return topic;
    }
    changed = true;
    return { ...topic, name: renamed };
  });
  return changed ? next : topics;
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
    descriptionOverrides,
    bodyOverrides,
    topicsOverrides,
    tagsOverrides,
    tagRenames,
    topicRenames,
    removedReferenceKeys,
    referenceOverrides,
    mergeNoteOverrides,
  } = overrides;

  const digestRows = review.digests
    .map((digest, index) => ({
      digest,
      index,
      title: titleOverrides.get(index) ?? digest.title,
      description: descriptionOverrides.get(index) ?? digest.description,
      body: bodyOverrides.get(index) ?? digest.body,
      topics: applyTopicRenames(
        topicsOverrides.get(index) ?? digest.topics,
        topicRenames,
      ),
      tags: applyTagRenames(
        tagsOverrides.get(index) ?? digest.tags,
        tagRenames,
      ),
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

  // tagRenames/topicRenames도 포함해야 한다 — 태그 이름만 바꾸고 다른 편집이
  // 없으면 dirty=false로 confirm 흐름이 updateReview를 건너뛰는데, 그러면
  // digestRows(rename이 반영된)가 서버로 아예 안 나가 tagRenames를 저장에 넣은
  // 의미가 없어진다(tags.update RPC로 태그 자체는 바뀌어도, confirm의
  // find-or-create가 여전히 pending_ingestion에 저장된 옛 이름을 본다).
  const dirty =
    removedDigestIndexes.size > 0 ||
    titleOverrides.size > 0 ||
    descriptionOverrides.size > 0 ||
    bodyOverrides.size > 0 ||
    topicsOverrides.size > 0 ||
    tagsOverrides.size > 0 ||
    tagRenames.size > 0 ||
    topicRenames.size > 0 ||
    removedReferenceKeys.size > 0 ||
    referenceOverrides.size > 0 ||
    mergeNoteOverrides.size > 0;
  const hasCandidates = digestRows.length + referenceRows.length > 0;
  const hasEmptyTitle = digestRows.some((row) => row.title.trim() === "");
  const hasEmptyDescription = digestRows.some(
    (row) => row.description.trim() === "",
  );
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
    hasEmptyDescription,
    hasEmptyLabel,
    hasEmptyReference,
    referenceUpdates,
  };
}

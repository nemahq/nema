import { useState } from "react";

import { computeReviewEditingState } from "@web/features/review/reviewEditingState";
import type {
  DigestReviewDetail,
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";

// Digest 리뷰 화면의 로컬 편집 세션 상태 — 후보별 override·삭제를 모아, 확정 시 한
// 번에 반영할 편집 결과(행 목록·변경 여부·확정 차단 조건)를 파생한다. 서버엔 확정
// 직전에만 보내(중간 저장 없음) 전부 컴포넌트 로컬 상태로만 산다 — 새로고침하면 사라짐.
export function useReviewEditingState(review: DigestReviewDetail) {
  const [removedDigestIndexes, setRemovedDigestIndexes] = useState<Set<number>>(
    new Set(),
  );
  const [titleOverrides, setTitleOverrides] = useState<Map<number, string>>(
    new Map(),
  );
  const [bodyOverrides, setBodyOverrides] = useState<
    Map<number, ReviewDigest["body"]>
  >(new Map());
  const [topicsOverrides, setTopicsOverrides] = useState<
    Map<number, ReviewDigest["topics"]>
  >(new Map());
  const [tagsOverrides, setTagsOverrides] = useState<
    Map<number, ReviewDigest["tags"]>
  >(new Map());
  const [removedReferenceKeys, setRemovedReferenceKeys] = useState<Set<string>>(
    new Set(),
  );
  // 신규 Reference 후보 편집(타입·이름·설명) — key로 원본 draft를 덮어쓴다.
  const [referenceOverrides, setReferenceOverrides] = useState<
    Map<string, ReviewNewReference>
  >(new Map());
  // 기존 Reference 병합 편집 — referenceId로 엔진 제안 mergeNote를 덮어쓴다.
  // "원래대로"(거부)도 원본 body로 되돌리는 override라 별도 상태가 필요 없다.
  const [mergeNoteOverrides, setMergeNoteOverrides] = useState<
    Map<string, string>
  >(new Map());

  const {
    digestRows,
    referenceRows,
    mergeRows,
    dirty,
    hasCandidates,
    hasEmptyTitle,
    hasEmptyLabel,
    hasEmptyReference,
    referenceUpdates,
  } = computeReviewEditingState(review, {
    removedDigestIndexes,
    titleOverrides,
    bodyOverrides,
    topicsOverrides,
    tagsOverrides,
    removedReferenceKeys,
    referenceOverrides,
    mergeNoteOverrides,
  });

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
    setDigestTitle: (index: number, value: string) =>
      setTitleOverrides((prev) => new Map(prev).set(index, value)),
    setDigestBody: (index: number, value: ReviewDigest["body"]) =>
      setBodyOverrides((prev) => new Map(prev).set(index, value)),
    setDigestTopics: (index: number, value: ReviewDigest["topics"]) =>
      setTopicsOverrides((prev) => new Map(prev).set(index, value)),
    setDigestTags: (index: number, value: ReviewDigest["tags"]) =>
      setTagsOverrides((prev) => new Map(prev).set(index, value)),
    removeDigest: (index: number) =>
      setRemovedDigestIndexes((prev) => new Set(prev).add(index)),
    setReference: (key: string, value: ReviewNewReference) =>
      setReferenceOverrides((prev) => new Map(prev).set(key, value)),
    removeReference: (key: string) =>
      setRemovedReferenceKeys((prev) => new Set(prev).add(key)),
    setMergeNote: (referenceId: string, value: string) =>
      setMergeNoteOverrides((prev) => new Map(prev).set(referenceId, value)),
  };
}

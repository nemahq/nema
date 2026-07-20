import { createStore } from "zustand/vanilla";

import {
  computeReviewEditingState,
  type ReviewOverrides,
} from "@web/features/review/reviewEditingState";
import type {
  DigestReviewDetail,
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";

export type ReviewEditingAction =
  | { type: "digest/setTitle"; index: number; title: string }
  | { type: "digest/setBody"; index: number; body: ReviewDigest["body"] }
  | { type: "digest/setTopics"; index: number; topics: ReviewDigest["topics"] }
  | { type: "digest/setTags"; index: number; tags: ReviewDigest["tags"] }
  | { type: "digest/remove"; index: number }
  | { type: "reference/set"; key: string; reference: ReviewNewReference }
  | { type: "reference/remove"; key: string }
  | { type: "reference/setMergeNote"; referenceId: string; mergeNote: string };

function emptyOverrides(): ReviewOverrides {
  return {
    removedDigestIndexes: new Set(),
    titleOverrides: new Map(),
    bodyOverrides: new Map(),
    topicsOverrides: new Map(),
    tagsOverrides: new Map(),
    removedReferenceKeys: new Set(),
    referenceOverrides: new Map(),
    mergeNoteOverrides: new Map(),
  };
}

// 편집 경로를 하나로 모으는 이유는 review-flow.md의 실행취소·다시 실행 — 액션 로그만
// 쌓으면 되게 하려는 것이다. 흩어진 setState로는 "가장 최근 액션"을 표현할 수 없다.
export function reviewEditingReducer(
  overrides: ReviewOverrides,
  action: ReviewEditingAction,
): ReviewOverrides {
  switch (action.type) {
    case "digest/setTitle":
      return {
        ...overrides,
        titleOverrides: new Map(overrides.titleOverrides).set(
          action.index,
          action.title,
        ),
      };
    case "digest/setBody":
      return {
        ...overrides,
        bodyOverrides: new Map(overrides.bodyOverrides).set(
          action.index,
          action.body,
        ),
      };
    case "digest/setTopics":
      return {
        ...overrides,
        topicsOverrides: new Map(overrides.topicsOverrides).set(
          action.index,
          action.topics,
        ),
      };
    case "digest/setTags":
      return {
        ...overrides,
        tagsOverrides: new Map(overrides.tagsOverrides).set(
          action.index,
          action.tags,
        ),
      };
    case "digest/remove":
      return {
        ...overrides,
        removedDigestIndexes: new Set(overrides.removedDigestIndexes).add(
          action.index,
        ),
      };
    case "reference/set":
      return {
        ...overrides,
        referenceOverrides: new Map(overrides.referenceOverrides).set(
          action.key,
          action.reference,
        ),
      };
    case "reference/remove":
      return {
        ...overrides,
        removedReferenceKeys: new Set(overrides.removedReferenceKeys).add(
          action.key,
        ),
      };
    case "reference/setMergeNote":
      return {
        ...overrides,
        mergeNoteOverrides: new Map(overrides.mergeNoteOverrides).set(
          action.referenceId,
          action.mergeNote,
        ),
      };
  }
}

export type ReviewEditingDerived = ReturnType<typeof computeReviewEditingState>;

export interface ReviewEditingStoreState {
  // 편집의 기준이 되는 원본 스냅샷. override와 분리해 들고 있어야 review-flow.md의
  // "엔진 제안 대비 교정 신호"를 확정 시점에 뽑아낼 수 있다.
  review: DigestReviewDetail;
  overrides: ReviewOverrides;
  derived: ReviewEditingDerived;
  dispatch: (action: ReviewEditingAction) => void;
}

export type ReviewEditingStore = ReturnType<typeof createReviewEditingStore>;

// 서버엔 확정 직전에만 보낸다(중간 저장 없음) — 새로고침하면 편집 내용은 사라진다.
// 전역 싱글톤이 아닌 화면당 인스턴스라, 화면을 벗어나면 store째 소멸한다.
export function createReviewEditingStore(review: DigestReviewDetail) {
  return createStore<ReviewEditingStoreState>()((set, get) => ({
    review,
    overrides: emptyOverrides(),
    derived: computeReviewEditingState(review, emptyOverrides()),
    dispatch: (action) => {
      const overrides = reviewEditingReducer(get().overrides, action);
      set({ overrides, derived: computeReviewEditingState(review, overrides) });
    },
  }));
}

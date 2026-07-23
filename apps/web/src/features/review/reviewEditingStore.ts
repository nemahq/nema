import { createStore } from "zustand/vanilla";

import {
  DIGEST_BODY_FIELDS,
  type DigestBodyFieldKey,
} from "@web/features/review/constants";
import type { ReviewOverrides } from "@web/features/review/reviewEditingState";
import type {
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";

export type ReviewEditingAction =
  | { type: "digest/setTitle"; index: number; title: string }
  | { type: "digest/setDescription"; index: number; description: string }
  | { type: "digest/setBody"; index: number; body: ReviewDigest["body"] }
  // 본문 필드 하나만 고치는 경로 — 필드가 자기 값만 구독하고 나머지 형제 필드를
  // 안 읽어도 되게 한다. overrides는 서버 상태 위의 차분이라 아직 오버라이드가
  // 없는 첫 수정엔 합칠 바탕이 필요해서, 호출부가 서버 body를 같이 넘긴다.
  | {
      type: "digest/setBodyField";
      index: number;
      baseBody: ReviewDigest["body"];
      key: DigestBodyFieldKey;
      value: string | string[];
    }
  | { type: "digest/setTopics"; index: number; topics: ReviewDigest["topics"] }
  | { type: "digest/setTags"; index: number; tags: ReviewDigest["tags"] }
  | { type: "digest/remove"; index: number }
  // 이 id를 쓰는 모든 Digest에 적용되는 전역 액션 — digest/setTags처럼 index를
  // 받지 않는다(reviewEditingState.ts의 tagRenames/topicRenames 주석 참고).
  | { type: "tag/renamed"; id: string; title: string; description: string }
  | { type: "topic/renamed"; id: string; name: string }
  | { type: "reference/set"; key: string; reference: ReviewNewReference }
  | { type: "reference/remove"; key: string }
  | { type: "reference/setMergeNote"; referenceId: string; mergeNote: string };

function emptyOverrides(): ReviewOverrides {
  return {
    removedDigestIndexes: new Set(),
    titleOverrides: new Map(),
    descriptionOverrides: new Map(),
    bodyOverrides: new Map(),
    topicsOverrides: new Map(),
    tagsOverrides: new Map(),
    tagRenames: new Map(),
    topicRenames: new Map(),
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
    case "digest/setDescription":
      return {
        ...overrides,
        descriptionOverrides: new Map(overrides.descriptionOverrides).set(
          action.index,
          action.description,
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
    case "digest/setBodyField": {
      const current =
        overrides.bodyOverrides.get(action.index) ?? action.baseBody;
      // key는 DigestBodyFieldKey(모든 타입의 필드를 합친 union)라 current.type과
      // 무관한 값도 타입 체크를 통과한다 — 실제로 섞이면 서버 zod가 조용히
      // 스트립하지만, 그 전에 여기서 막아 오버라이드 자체를 오염시키지 않는다.
      const isValidForCurrentType = DIGEST_BODY_FIELDS[current.type].some(
        (field) => field.key === action.key,
      );
      if (!isValidForCurrentType) {
        return overrides;
      }
      const next: ReviewDigest["body"] = {
        ...current,
        [action.key]: action.value,
      };
      return {
        ...overrides,
        bodyOverrides: new Map(overrides.bodyOverrides).set(action.index, next),
      };
    }
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
    case "tag/renamed":
      return {
        ...overrides,
        tagRenames: new Map(overrides.tagRenames).set(action.id, {
          title: action.title,
          description: action.description,
        }),
      };
    case "topic/renamed":
      return {
        ...overrides,
        topicRenames: new Map(overrides.topicRenames).set(
          action.id,
          action.name,
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

export interface ReviewEditingStoreState {
  overrides: ReviewOverrides;
  dispatch: (action: ReviewEditingAction) => void;
  // 편집 내용이 서버에 반영된 뒤 부르는 것 — override는 그 시점에 중복이고, 더
  // 중요하게는 위험하다. 저장 RPC가 changes를 전량 재삽입해 digests 배열의 순서가
  // 다시 섞이는데, override는 인덱스로 키를 잡으므로 남겨두면 다른 후보에 붙는다.
  reset: () => void;
}

export type ReviewEditingStore = ReturnType<typeof createReviewEditingStore>;

// 유저가 덮어쓴 값만 담는다 — 편집의 기준이 되는 원본은 digestReview.get 캐시가
// 그대로 갖고 있고(refetch되면 그쪽이 갱신된다), 파생은 둘을 합쳐 계산한다.
// 원본을 여기 복사해 두면 refetch 이후 화면이 옛 스냅샷에 갇힌다.
//
// 서버엔 확정 직전에만 보낸다(중간 저장 없음) — 새로고침하면 편집 내용은 사라진다.
// 전역 싱글톤이 아닌 화면당 인스턴스라, 화면을 벗어나면 store째 소멸한다.
export function createReviewEditingStore() {
  return createStore<ReviewEditingStoreState>()((set, get) => ({
    overrides: emptyOverrides(),
    dispatch: (action) =>
      set({ overrides: reviewEditingReducer(get().overrides, action) }),
    reset: () => set({ overrides: emptyOverrides() }),
  }));
}

import { describe, expect, it } from "vitest";

import type { ReviewOverrides } from "@web/features/review/reviewEditingState";
import {
  createReviewEditingStore,
  type ReviewEditingAction,
  reviewEditingReducer,
} from "@web/features/review/reviewEditingStore";

function emptyOverrides(): ReviewOverrides {
  return {
    removedDigestIndexes: new Set(),
    titleOverrides: new Map(),
    descriptionOverrides: new Map(),
    bodyOverrides: new Map(),
    topicsOverrides: new Map(),
    tagsOverrides: new Map(),
    removedReferenceKeys: new Set(),
    referenceOverrides: new Map(),
    mergeNoteOverrides: new Map(),
  };
}

// 액션마다 "어느 슬롯에 써야 하는지"를 픽스처에 박아둔다 — 9개가 같은 모양이라
// topicsOverrides에 쓸 것을 tagsOverrides에 쓰는 복붙 실수가 가장 나기 쉽고,
// 채워진 슬롯 개수만 세면 그 실수가 그대로 통과한다.
const ACTIONS: { action: ReviewEditingAction; slot: keyof ReviewOverrides }[] =
  [
    {
      action: { type: "digest/setTitle", index: 0, title: "제목" },
      slot: "titleOverrides",
    },
    {
      action: {
        type: "digest/setDescription",
        index: 0,
        description: "설명",
      },
      slot: "descriptionOverrides",
    },
    {
      action: { type: "digest/setBody", index: 0, body: { type: "decision" } },
      slot: "bodyOverrides",
    },
    {
      action: {
        type: "digest/setTopics",
        index: 0,
        topics: [{ id: null, name: "주제" }],
      },
      slot: "topicsOverrides",
    },
    {
      action: {
        type: "digest/setTags",
        index: 0,
        tags: [{ id: null, title: "태그", description: "설명" }],
      },
      slot: "tagsOverrides",
    },
    {
      action: { type: "digest/remove", index: 0 },
      slot: "removedDigestIndexes",
    },
    {
      action: {
        type: "reference/set",
        key: "ref-key",
        reference: {
          key: "ref-key",
          type: "person",
          title: "이름",
          body: "설명",
          externalUrls: [],
        },
      },
      slot: "referenceOverrides",
    },
    {
      action: { type: "reference/remove", key: "ref-key" },
      slot: "removedReferenceKeys",
    },
    {
      action: {
        type: "reference/setMergeNote",
        referenceId: "ref-id",
        mergeNote: "병합",
      },
      slot: "mergeNoteOverrides",
    },
  ];

// 8개 useState로 흩어져 있을 땐 액션이 다른 상태를 건드릴 수 없다는 게 구조적으로
// 보장됐다. reducer로 합치면서 그 보장이 사라졌으므로 여기서 다시 고정한다.
describe("reviewEditingReducer", () => {
  it.each(ACTIONS)("$action.type은 $slot에만 쓴다", ({ action, slot }) => {
    const next = reviewEditingReducer(emptyOverrides(), action);

    const filled = Object.entries(next)
      .filter(([, entries]) => entries.size > 0)
      .map(([name]) => name);
    expect(filled).toEqual([slot]);
  });

  it.each(ACTIONS)(
    "$action.type은 이전 상태를 변형하지 않는다",
    ({ action }) => {
      const previous = emptyOverrides();

      reviewEditingReducer(previous, action);

      expect(previous).toEqual(emptyOverrides());
    },
  );
});

// setBodyField만 다른 액션과 달리 기존 값 위에 얹는다 — 슬롯을 통째로 덮어쓰면
// 같은 카드의 앞선 수정이 조용히 사라지는데, 슬롯 개수만 보는 위 검사로는 안 잡힌다.
describe("digest/setBodyField", () => {
  const BASE_BODY = {
    type: "decision",
    situation: "원래 상황",
    choice: "원래 선택",
  } as const;

  it("오버라이드가 없으면 서버 body 위에 얹는다", () => {
    const next = reviewEditingReducer(emptyOverrides(), {
      type: "digest/setBodyField",
      index: 0,
      baseBody: BASE_BODY,
      key: "choice",
      value: "고친 선택",
    });

    expect(next.bodyOverrides.get(0)).toEqual({
      ...BASE_BODY,
      choice: "고친 선택",
    });
  });

  it("다른 필드를 이어서 고쳐도 앞선 수정이 남는다", () => {
    const first = reviewEditingReducer(emptyOverrides(), {
      type: "digest/setBodyField",
      index: 0,
      baseBody: BASE_BODY,
      key: "choice",
      value: "고친 선택",
    });
    const second = reviewEditingReducer(first, {
      type: "digest/setBodyField",
      index: 0,
      baseBody: BASE_BODY,
      key: "situation",
      value: "고친 상황",
    });

    expect(second.bodyOverrides.get(0)).toEqual({
      type: "decision",
      situation: "고친 상황",
      choice: "고친 선택",
    });
  });
});

describe("createReviewEditingStore", () => {
  it("dispatch가 reducer 결과를 상태에 반영한다", () => {
    const store = createReviewEditingStore();

    store
      .getState()
      .dispatch({ type: "digest/setTitle", index: 0, title: "제목" });

    expect(store.getState().overrides.titleOverrides.get(0)).toBe("제목");
  });

  it("인스턴스끼리 편집 상태를 공유하지 않는다", () => {
    const store = createReviewEditingStore();
    const other = createReviewEditingStore();

    store
      .getState()
      .dispatch({ type: "digest/setTitle", index: 0, title: "제목" });

    expect(other.getState().overrides.titleOverrides.size).toBe(0);
  });
});

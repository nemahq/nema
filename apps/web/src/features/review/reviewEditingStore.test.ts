import { describe, expect, it } from "vitest";

import type { ReviewOverrides } from "@web/features/review/reviewEditingState";
import {
  type ReviewEditingAction,
  reviewEditingReducer,
} from "@web/features/review/reviewEditingStore";

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

const ACTIONS: ReviewEditingAction[] = [
  { type: "digest/setTitle", index: 0, title: "제목" },
  { type: "digest/setBody", index: 0, body: { type: "decision" } },
  { type: "digest/setTopics", index: 0, topics: [{ id: null, name: "주제" }] },
  {
    type: "digest/setTags",
    index: 0,
    tags: [{ id: null, title: "태그", description: "설명" }],
  },
  { type: "digest/remove", index: 0 },
  {
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
  { type: "reference/remove", key: "ref-key" },
  { type: "reference/setMergeNote", referenceId: "ref-id", mergeNote: "병합" },
];

// 8개 useState로 흩어져 있을 땐 액션이 다른 상태를 건드릴 수 없다는 게 구조적으로
// 보장됐다. reducer로 합치면서 그 보장이 사라졌으므로 여기서 다시 고정한다.
describe("reviewEditingReducer", () => {
  it.each(ACTIONS)("$type은 자기 override 하나만 채운다", (action) => {
    const next = reviewEditingReducer(emptyOverrides(), action);

    const touched = Object.entries(next).filter(([, slot]) => slot.size > 0);
    expect(touched).toHaveLength(1);
  });

  it.each(ACTIONS)("$type은 이전 상태를 변형하지 않는다", (action) => {
    const previous = emptyOverrides();

    reviewEditingReducer(previous, action);

    expect(previous).toEqual(emptyOverrides());
  });

  it("같은 대상에 대한 연속 편집은 마지막 값만 남긴다", () => {
    const first = reviewEditingReducer(emptyOverrides(), {
      type: "digest/setTitle",
      index: 0,
      title: "처음",
    });

    const second = reviewEditingReducer(first, {
      type: "digest/setTitle",
      index: 0,
      title: "나중",
    });

    expect(second.titleOverrides.get(0)).toBe("나중");
    expect(second.titleOverrides.size).toBe(1);
  });
});

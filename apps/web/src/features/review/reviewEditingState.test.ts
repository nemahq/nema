import { describe, expect, it } from "vitest";

import {
  computeReviewEditingState,
  type ReviewOverrides,
} from "./reviewEditingState";
import type {
  DigestReviewDetail,
  ReviewCitedReference,
  ReviewDigest,
  ReviewNewReference,
} from "./types";

const DIGEST: ReviewDigest = {
  title: "제목",
  description: "요약",
  body: { type: "decision" },
  topics: [{ id: null, name: "주제" }],
  tags: [{ id: null, title: "태그", description: "설명" }],
  referenceIds: [],
  newReferenceKeys: [],
  externalUrls: [],
};

const NEW_REFERENCE: ReviewNewReference = {
  key: "ref-1",
  type: "person",
  title: "인물",
  body: "설명",
  externalUrls: [],
};

const CITED_REFERENCE_WITH_MERGE: ReviewCitedReference = {
  id: "cited-1",
  type: "organization",
  title: "조직",
  body: "원본 설명",
  mergeNote: "다듬은 설명",
};

function review(
  overrides: Partial<DigestReviewDetail> = {},
): DigestReviewDetail {
  return {
    changesetId: "changeset-1",
    changesetNumber: 1,
    spaceId: "space-1",
    sourceId: "source-1",
    sourceTitle: "원문 제목",
    sourceBody: "원문 본문",
    sourceCreatedAt: "2026-07-18T00:00:00.000Z",
    digests: [DIGEST],
    newReferences: [],
    citedReferences: [],
    ...overrides,
  };
}

const EMPTY_OVERRIDES: ReviewOverrides = {
  removedDigestIndexes: new Set(),
  titleOverrides: new Map(),
  bodyOverrides: new Map(),
  topicsOverrides: new Map(),
  tagsOverrides: new Map(),
  removedReferenceKeys: new Set(),
  referenceOverrides: new Map(),
  mergeNoteOverrides: new Map(),
};

describe("computeReviewEditingState — dirty", () => {
  it("override가 하나도 없으면 dirty=false", () => {
    const result = computeReviewEditingState(review(), EMPTY_OVERRIDES);
    expect(result.dirty).toBe(false);
  });

  it("Digest 삭제만 있어도 dirty=true", () => {
    const result = computeReviewEditingState(review(), {
      ...EMPTY_OVERRIDES,
      removedDigestIndexes: new Set([0]),
    });
    expect(result.dirty).toBe(true);
  });

  it("병합 설명 override만 있어도 dirty=true", () => {
    const result = computeReviewEditingState(review(), {
      ...EMPTY_OVERRIDES,
      mergeNoteOverrides: new Map([["cited-1", "새 설명"]]),
    });
    expect(result.dirty).toBe(true);
  });
});

describe("computeReviewEditingState — digestRows", () => {
  it("removedDigestIndexes에 속한 행은 목록에서 빠진다", () => {
    const result = computeReviewEditingState(
      review({ digests: [DIGEST, DIGEST] }),
      { ...EMPTY_OVERRIDES, removedDigestIndexes: new Set([0]) },
    );
    expect(result.digestRows).toHaveLength(1);
    expect(result.digestRows[0].index).toBe(1);
  });

  it("title override가 있으면 원본 대신 override 값을 쓴다", () => {
    const result = computeReviewEditingState(review(), {
      ...EMPTY_OVERRIDES,
      titleOverrides: new Map([[0, "수정된 제목"]]),
    });
    expect(result.digestRows[0].title).toBe("수정된 제목");
  });
});

describe("computeReviewEditingState — hasCandidates", () => {
  it("Digest·신규 Reference가 모두 없으면 false", () => {
    const result = computeReviewEditingState(
      review({ digests: [] }),
      EMPTY_OVERRIDES,
    );
    expect(result.hasCandidates).toBe(false);
  });

  it("마지막 남은 Digest 하나를 삭제하면 false로 바뀐다", () => {
    const result = computeReviewEditingState(review(), {
      ...EMPTY_OVERRIDES,
      removedDigestIndexes: new Set([0]),
    });
    expect(result.hasCandidates).toBe(false);
  });

  it("Digest는 없어도 신규 Reference가 있으면 true", () => {
    const result = computeReviewEditingState(
      review({ digests: [], newReferences: [NEW_REFERENCE] }),
      EMPTY_OVERRIDES,
    );
    expect(result.hasCandidates).toBe(true);
  });
});

describe("computeReviewEditingState — hasEmptyTitle", () => {
  it("모든 Digest 제목이 있으면 false", () => {
    const result = computeReviewEditingState(review(), EMPTY_OVERRIDES);
    expect(result.hasEmptyTitle).toBe(false);
  });

  it("제목을 빈 문자열로 override하면 true", () => {
    const result = computeReviewEditingState(review(), {
      ...EMPTY_OVERRIDES,
      titleOverrides: new Map([[0, "   "]]),
    });
    expect(result.hasEmptyTitle).toBe(true);
  });
});

describe("computeReviewEditingState — hasEmptyLabel", () => {
  it("Topic 이름을 빈 문자열로 override하면 true", () => {
    const result = computeReviewEditingState(review(), {
      ...EMPTY_OVERRIDES,
      topicsOverrides: new Map([[0, [{ id: null, name: "" }]]]),
    });
    expect(result.hasEmptyLabel).toBe(true);
  });

  it("Tag 이름을 빈 문자열로 override하면 true", () => {
    const result = computeReviewEditingState(review(), {
      ...EMPTY_OVERRIDES,
      tagsOverrides: new Map([
        [0, [{ id: null, title: "", description: "설명" }]],
      ]),
    });
    expect(result.hasEmptyLabel).toBe(true);
  });
});

describe("computeReviewEditingState — hasEmptyReference", () => {
  it("신규 Reference 제목이 비면 true", () => {
    const result = computeReviewEditingState(
      review({ newReferences: [NEW_REFERENCE] }),
      {
        ...EMPTY_OVERRIDES,
        referenceOverrides: new Map([
          ["ref-1", { ...NEW_REFERENCE, title: "" }],
        ]),
      },
    );
    expect(result.hasEmptyReference).toBe(true);
  });

  it("병합 대상 Reference의 mergeNote를 빈 문자열로 override하면 true", () => {
    const result = computeReviewEditingState(
      review({
        digests: [{ ...DIGEST, referenceIds: ["cited-1"] }],
        citedReferences: [CITED_REFERENCE_WITH_MERGE],
      }),
      {
        ...EMPTY_OVERRIDES,
        mergeNoteOverrides: new Map([["cited-1", "  "]]),
      },
    );
    expect(result.hasEmptyReference).toBe(true);
  });

  it("모든 필드가 채워져 있으면 false", () => {
    const result = computeReviewEditingState(
      review({ newReferences: [NEW_REFERENCE] }),
      EMPTY_OVERRIDES,
    );
    expect(result.hasEmptyReference).toBe(false);
  });
});

describe("computeReviewEditingState — mergeRows/referenceUpdates", () => {
  it("살아있는 Digest가 인용하는 병합 대상만 mergeRows·referenceUpdates에 실린다", () => {
    const result = computeReviewEditingState(
      review({
        digests: [{ ...DIGEST, referenceIds: ["cited-1"] }],
        citedReferences: [CITED_REFERENCE_WITH_MERGE],
      }),
      EMPTY_OVERRIDES,
    );
    expect(result.mergeRows).toHaveLength(1);
    expect(result.referenceUpdates).toEqual([
      { referenceId: "cited-1", mergeNote: "다듬은 설명" },
    ]);
  });

  it("인용하던 Digest를 삭제하면 mergeRows·referenceUpdates에서도 빠진다", () => {
    const result = computeReviewEditingState(
      review({
        digests: [{ ...DIGEST, referenceIds: ["cited-1"] }],
        citedReferences: [CITED_REFERENCE_WITH_MERGE],
      }),
      { ...EMPTY_OVERRIDES, removedDigestIndexes: new Set([0]) },
    );
    expect(result.mergeRows).toHaveLength(0);
    expect(result.referenceUpdates).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";

import type { ReviewDraft } from "./reviewDraft";
import { computeReviewEditingState } from "./reviewEditingState";
import type {
  ReviewCitedReference,
  ReviewDigest,
  ReviewNewReference,
} from "./types";

const DIGEST: ReviewDigest = {
  id: "digest-1",
  position: 0,
  title: "제목",
  description: "요약",
  body: { type: "decision" },
  topics: [{ id: null, title: "주제" }],
  tags: [{ id: null, title: "태그", description: "설명" }],
  referenceIds: [],
  newReferenceKeys: [],
  externalUrls: [],
};

const NEW_REFERENCE: ReviewNewReference = {
  id: "ref-1",
  position: 0,
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

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    changesetId: "changeset-1",
    changesetNumber: 1,
    spaceId: "space-1",
    sourceId: "source-1",
    sourceTitle: "원문 제목",
    sourceBody: "원문 본문",
    sourceCreatedAt: "2026-07-18T00:00:00.000Z",
    draftVersion: 1,
    digests: [DIGEST],
    newReferences: [],
    citedReferences: [],
    ...overrides,
  };
}

describe("computeReviewEditingState — hasCandidates", () => {
  it("Digest·신규 Reference가 모두 없으면 false", () => {
    const result = computeReviewEditingState(draft({ digests: [] }));
    expect(result.hasCandidates).toBe(false);
  });

  it("Digest는 없어도 신규 Reference가 있으면 true", () => {
    const result = computeReviewEditingState(
      draft({ digests: [], newReferences: [NEW_REFERENCE] }),
    );
    expect(result.hasCandidates).toBe(true);
  });
});

describe("computeReviewEditingState — 확정 차단 조건", () => {
  it("모든 필드가 채워져 있으면 아무 것도 걸리지 않는다", () => {
    const result = computeReviewEditingState(
      draft({ newReferences: [NEW_REFERENCE] }),
    );

    expect(result.hasEmptyTitle).toBe(false);
    expect(result.hasEmptyDescription).toBe(false);
    expect(result.hasEmptyLabel).toBe(false);
    expect(result.hasEmptyReference).toBe(false);
  });

  it("제목이 공백뿐이면 hasEmptyTitle", () => {
    const result = computeReviewEditingState(
      draft({ digests: [{ ...DIGEST, title: "   " }] }),
    );
    expect(result.hasEmptyTitle).toBe(true);
  });

  it("설명이 공백뿐이면 hasEmptyDescription", () => {
    const result = computeReviewEditingState(
      draft({ digests: [{ ...DIGEST, description: "   " }] }),
    );
    expect(result.hasEmptyDescription).toBe(true);
  });

  it("Topic 이름이 비면 hasEmptyLabel", () => {
    const result = computeReviewEditingState(
      draft({ digests: [{ ...DIGEST, topics: [{ id: null, title: "" }] }] }),
    );
    expect(result.hasEmptyLabel).toBe(true);
  });

  it("Tag 이름이 비면 hasEmptyLabel", () => {
    const result = computeReviewEditingState(
      draft({
        digests: [
          {
            ...DIGEST,
            tags: [{ id: null, title: "", description: "설명" }],
          },
        ],
      }),
    );
    expect(result.hasEmptyLabel).toBe(true);
  });

  it("신규 Reference 이름이 비면 hasEmptyReference", () => {
    const result = computeReviewEditingState(
      draft({ newReferences: [{ ...NEW_REFERENCE, title: "" }] }),
    );
    expect(result.hasEmptyReference).toBe(true);
  });

  it("병합 대상 Reference의 병합 설명이 공백뿐이면 hasEmptyReference", () => {
    const result = computeReviewEditingState(
      draft({
        digests: [{ ...DIGEST, referenceIds: ["cited-1"] }],
        citedReferences: [{ ...CITED_REFERENCE_WITH_MERGE, mergeNote: "  " }],
      }),
    );
    expect(result.hasEmptyReference).toBe(true);
  });
});

describe("computeReviewEditingState — referenceUpdates", () => {
  it("살아있는 Digest가 인용하는 병합 대상만 실린다", () => {
    const result = computeReviewEditingState(
      draft({
        digests: [{ ...DIGEST, referenceIds: ["cited-1"] }],
        citedReferences: [CITED_REFERENCE_WITH_MERGE],
      }),
    );

    expect(result.referenceUpdates).toEqual([
      { referenceId: "cited-1", mergeNote: "다듬은 설명" },
    ]);
  });

  // 후보 삭제는 초안에서 Digest 자체를 빼므로, 그 Digest만 인용하던 병합 제안도
  // 같이 사라져야 한다 — 남으면 아무도 인용하지 않는 Reference를 병합하게 된다.
  it("인용하던 Digest가 초안에서 빠지면 referenceUpdates에서도 빠진다", () => {
    const result = computeReviewEditingState(
      draft({
        digests: [],
        citedReferences: [CITED_REFERENCE_WITH_MERGE],
      }),
    );

    expect(result.referenceUpdates).toHaveLength(0);
  });
});

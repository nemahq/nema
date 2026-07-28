import { describe, expect, it } from "vitest";

import type { ReviewDraft } from "./reviewDraft";
import { buildUpdateReviewPayload } from "./reviewSavePayload";
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
  topics: [],
  tags: [],
  referenceIds: [],
  newReferenceKeys: [],
  externalUrls: [],
};

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    changesetId: "cs-1",
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

describe("buildUpdateReviewPayload", () => {
  it("changesetId·expectedVersion을 초안 그대로 싣는다", () => {
    const payload = buildUpdateReviewPayload(draft({ draftVersion: 3 }));

    expect(payload.changesetId).toBe("cs-1");
    expect(payload.expectedVersion).toBe(3);
  });

  it("Digest 제목·설명·주제·태그 이름의 앞뒤 공백을 다듬어 싣는다", () => {
    const editedDigest: ReviewDigest = {
      ...DIGEST,
      title: "  새 제목  ",
      description: "  새 설명  ",
      topics: [{ id: "topic-draft-1", registryId: null, title: " 새 주제 " }],
      tags: [
        {
          id: "tag-draft-1",
          registryId: null,
          title: " 새 태그 ",
          description: "설명",
        },
      ],
    };

    const payload = buildUpdateReviewPayload(
      draft({ digests: [editedDigest] }),
    );

    expect(payload.digests).toEqual([
      {
        ...editedDigest,
        title: "새 제목",
        description: "새 설명",
        topics: [{ id: "topic-draft-1", registryId: null, title: "새 주제" }],
        tags: [
          {
            id: "tag-draft-1",
            registryId: null,
            title: "새 태그",
            description: "설명",
          },
        ],
      },
    ]);
  });

  it("신규 Reference의 이름·설명 앞뒤 공백을 다듬어 싣는다", () => {
    const editedReference: ReviewNewReference = {
      id: "ref-1",
      position: 0,
      type: "person",
      title: "  홍길동  ",
      body: "  조선의 의적  ",
      externalUrls: [],
    };

    const payload = buildUpdateReviewPayload(
      draft({ newReferences: [editedReference] }),
    );

    expect(payload.newReferences).toEqual([
      { ...editedReference, title: "홍길동", body: "조선의 의적" },
    ]);
  });

  it("살아있는 Digest가 인용하는 기존 Reference 병합 제안만 다듬어 싣는다", () => {
    const citedReference: ReviewCitedReference = {
      id: "11111111-1111-1111-1111-111111111111",
      type: "organization",
      title: "조직",
      body: "원본 설명",
      mergeNote: "  다듬은 설명  ",
    };
    const orphanedCitedReference: ReviewCitedReference = {
      id: "22222222-2222-2222-2222-222222222222",
      type: "organization",
      title: "다른 조직",
      body: "원본 설명2",
      mergeNote: "인용하는 Digest가 없어 실리지 않아야 함",
    };

    const payload = buildUpdateReviewPayload(
      draft({
        digests: [{ ...DIGEST, referenceIds: [citedReference.id] }],
        citedReferences: [citedReference, orphanedCitedReference],
      }),
    );

    expect(payload.referenceUpdates).toEqual([
      { referenceId: citedReference.id, mergeNote: "다듬은 설명" },
    ]);
  });
});

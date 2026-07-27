import { describe, expect, it, vi } from "vitest";

import { confirmDisabledReason, runConfirmReview } from "./confirmReviewFlow";
import type { ReviewDraft } from "./reviewDraft";
import type { ReviewDigest, ReviewNewReference } from "./types";

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

describe("confirmDisabledReason", () => {
  it("후보가 하나도 없으면 no_candidates", () => {
    expect(confirmDisabledReason(false, false, false, false, false)).toBe(
      "no_candidates",
    );
  });

  it("후보는 있지만 제목이 빈 게 있으면 missing_title", () => {
    expect(confirmDisabledReason(true, true, false, false, false)).toBe(
      "missing_title",
    );
  });

  it("제목은 있지만 설명이 빈 게 있으면 missing_description", () => {
    expect(confirmDisabledReason(true, false, true, false, false)).toBe(
      "missing_description",
    );
  });

  it("제목·설명은 다 있지만 주제·태그 이름이 빈 게 있으면 empty_label", () => {
    expect(confirmDisabledReason(true, false, false, true, false)).toBe(
      "empty_label",
    );
  });

  it("제목·설명·라벨은 다 있지만 신규 Reference 필드가 빈 게 있으면 empty_reference", () => {
    expect(confirmDisabledReason(true, false, false, false, true)).toBe(
      "empty_reference",
    );
  });

  it("후보가 있고 제목·설명·라벨·레퍼런스 다 있으면 null(비활성 아님)", () => {
    expect(confirmDisabledReason(true, false, false, false, false)).toBeNull();
  });

  it("후보가 없으면 다른 문제와 무관하게 no_candidates가 우선", () => {
    expect(confirmDisabledReason(false, true, true, true, true)).toBe(
      "no_candidates",
    );
  });

  it("제목이 비어 있으면 다른 문제보다 missing_title이 우선", () => {
    expect(confirmDisabledReason(true, true, true, true, true)).toBe(
      "missing_title",
    );
  });

  it("설명이 비어 있으면 라벨 문제보다 missing_description이 우선", () => {
    expect(confirmDisabledReason(true, false, true, true, true)).toBe(
      "missing_description",
    );
  });

  it("라벨이 비어 있으면 레퍼런스 문제보다 empty_label이 우선", () => {
    expect(confirmDisabledReason(true, false, false, true, true)).toBe(
      "empty_label",
    );
  });
});

describe("runConfirmReview", () => {
  it("dirty하면 초안을 저장한 뒤 confirmReview를 부른다", async () => {
    const calls: string[] = [];
    const updateReview = vi.fn().mockImplementation(async () => {
      calls.push("update");
    });
    const confirmReview = vi.fn().mockImplementation(async () => {
      calls.push("confirm");
    });

    // 타입 변경 초기화 결과 — 원본 DIGEST.body(decision)와 다른 빈 body가 실려야 한다.
    const editedDigest: ReviewDigest = {
      ...DIGEST,
      title: "  새 제목  ",
      description: "  새 설명  ",
      body: { type: "learning" },
      topics: [{ id: null, title: " 새 주제 " }],
      tags: [{ id: null, title: " 새 태그 ", description: "설명" }],
    };

    await runConfirmReview({
      draft: draft({ digests: [editedDigest], draftVersion: 3 }),
      dirty: true,
      referenceUpdates: [],
      updateReview,
      confirmReview,
    });

    expect(calls).toEqual(["update", "confirm"]);
    expect(updateReview).toHaveBeenCalledWith({
      changesetId: "cs-1",
      expectedVersion: 3,
      digests: [
        {
          ...editedDigest,
          title: "새 제목",
          description: "새 설명",
          topics: [{ id: null, title: "새 주제" }],
          tags: [{ id: null, title: "새 태그", description: "설명" }],
        },
      ],
      newReferences: [],
      referenceUpdates: [],
    });
    expect(confirmReview).toHaveBeenCalledWith({ changesetId: "cs-1" });
  });

  it("신규 Reference의 이름·설명 앞뒤 공백을 다듬어 저장한다", async () => {
    const updateReview = vi.fn().mockResolvedValue(undefined);
    const confirmReview = vi.fn().mockResolvedValue(undefined);

    const editedReference: ReviewNewReference = {
      id: "ref-1",
      position: 0,
      type: "person",
      title: "  홍길동  ",
      body: "  조선의 의적  ",
      externalUrls: [],
    };

    await runConfirmReview({
      draft: draft({ newReferences: [editedReference] }),
      dirty: true,
      referenceUpdates: [],
      updateReview,
      confirmReview,
    });

    expect(updateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        newReferences: [
          { ...editedReference, title: "홍길동", body: "조선의 의적" },
        ],
      }),
    );
  });

  it("기존 Reference 병합 제안을 다듬어 전부 실어 보낸다(편집 여부 무관)", async () => {
    const updateReview = vi.fn().mockResolvedValue(undefined);
    const confirmReview = vi.fn().mockResolvedValue(undefined);

    await runConfirmReview({
      draft: draft(),
      dirty: true,
      referenceUpdates: [
        {
          referenceId: "11111111-1111-1111-1111-111111111111",
          mergeNote: "  다듬은 설명  ",
        },
        {
          referenceId: "22222222-2222-2222-2222-222222222222",
          mergeNote: "그대로 둔 제안",
        },
      ],
      updateReview,
      confirmReview,
    });

    expect(updateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceUpdates: [
          {
            referenceId: "11111111-1111-1111-1111-111111111111",
            mergeNote: "다듬은 설명",
          },
          {
            referenceId: "22222222-2222-2222-2222-222222222222",
            mergeNote: "그대로 둔 제안",
          },
        ],
      }),
    );
  });

  it("dirty하지 않으면 updateReview 없이 confirmReview만 부른다", async () => {
    const updateReview = vi.fn();
    const confirmReview = vi.fn().mockResolvedValue(undefined);

    await runConfirmReview({
      draft: draft(),
      dirty: false,
      referenceUpdates: [],
      updateReview,
      confirmReview,
    });

    expect(updateReview).not.toHaveBeenCalled();
    expect(confirmReview).toHaveBeenCalledWith({ changesetId: "cs-1" });
  });

  it("updateReview가 실패하면 confirmReview는 아예 호출되지 않는다", async () => {
    const updateReview = vi.fn().mockRejectedValue(new Error("save failed"));
    const confirmReview = vi.fn();

    await expect(
      runConfirmReview({
        draft: draft(),
        dirty: true,
        referenceUpdates: [],
        updateReview,
        confirmReview,
      }),
    ).rejects.toThrow("save failed");

    expect(confirmReview).not.toHaveBeenCalled();
  });
});

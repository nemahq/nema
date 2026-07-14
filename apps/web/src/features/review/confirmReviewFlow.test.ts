import { describe, expect, it, vi } from "vitest";

import { confirmDisabledReason, runConfirmReview } from "./confirmReviewFlow";
import type { ReviewDigest } from "./types";

const DIGEST: ReviewDigest = {
  title: "제목",
  description: "요약",
  body: { type: "decision" },
  topics: [],
  tags: [],
  referenceIds: [],
  newReferenceKeys: [],
  externalUrls: [],
};

describe("confirmDisabledReason", () => {
  it("후보가 하나도 없으면 no_candidates", () => {
    expect(confirmDisabledReason(false, false, false)).toBe("no_candidates");
  });

  it("후보는 있지만 제목이 빈 게 있으면 missing_title", () => {
    expect(confirmDisabledReason(true, true, false)).toBe("missing_title");
  });

  it("제목은 다 있지만 주제·태그 이름이 빈 게 있으면 empty_label", () => {
    expect(confirmDisabledReason(true, false, true)).toBe("empty_label");
  });

  it("후보가 있고 제목·라벨 다 있으면 null(비활성 아님)", () => {
    expect(confirmDisabledReason(true, false, false)).toBeNull();
  });

  it("후보가 없으면 다른 문제와 무관하게 no_candidates가 우선", () => {
    expect(confirmDisabledReason(false, true, true)).toBe("no_candidates");
  });

  it("제목이 비어 있으면 라벨 문제보다 missing_title이 우선", () => {
    expect(confirmDisabledReason(true, true, true)).toBe("missing_title");
  });
});

describe("runConfirmReview", () => {
  it("dirty하면 updateReview 완료 후에 confirmReview를 부른다", async () => {
    const calls: string[] = [];
    const updateReview = vi.fn().mockImplementation(async () => {
      calls.push("update");
    });
    const confirmReview = vi.fn().mockImplementation(async () => {
      calls.push("confirm");
    });

    const overriddenTopics: ReviewDigest["topics"] = [
      { id: null, name: "새 주제" },
    ];
    const overriddenTags: ReviewDigest["tags"] = [
      { id: null, title: "새 태그", description: "설명" },
    ];

    await runConfirmReview({
      changesetId: "cs-1",
      dirty: true,
      digestRows: [
        {
          digest: DIGEST,
          title: "  새 제목  ",
          topics: overriddenTopics,
          tags: overriddenTags,
        },
      ],
      newReferences: [],
      updateReview,
      confirmReview,
    });

    expect(calls).toEqual(["update", "confirm"]);
    expect(updateReview).toHaveBeenCalledWith({
      changesetId: "cs-1",
      digests: [
        {
          ...DIGEST,
          title: "새 제목",
          topics: overriddenTopics,
          tags: overriddenTags,
        },
      ],
      newReferences: [],
    });
    expect(confirmReview).toHaveBeenCalledWith({ changesetId: "cs-1" });
  });

  it("dirty하지 않으면 updateReview 없이 confirmReview만 부른다", async () => {
    const updateReview = vi.fn();
    const confirmReview = vi.fn().mockResolvedValue(undefined);

    await runConfirmReview({
      changesetId: "cs-1",
      dirty: false,
      digestRows: [
        { digest: DIGEST, title: DIGEST.title, topics: [], tags: [] },
      ],
      newReferences: [],
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
        changesetId: "cs-1",
        dirty: true,
        digestRows: [
          { digest: DIGEST, title: DIGEST.title, topics: [], tags: [] },
        ],
        newReferences: [],
        updateReview,
        confirmReview,
      }),
    ).rejects.toThrow("save failed");

    expect(confirmReview).not.toHaveBeenCalled();
  });
});

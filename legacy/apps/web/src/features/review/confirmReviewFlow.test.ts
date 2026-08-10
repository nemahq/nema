import { describe, expect, it, vi } from "vitest";

import { confirmDisabledReason, runConfirmReview } from "./confirmReviewFlow";

const ALL_FILLED = {
  hasCandidates: true,
  hasEmptyTitle: false,
  hasEmptyDescription: false,
  hasEmptyLabel: false,
  hasEmptyReference: false,
};

describe("confirmDisabledReason", () => {
  it("후보가 하나도 없으면 no_candidates", () => {
    expect(confirmDisabledReason({ ...ALL_FILLED, hasCandidates: false })).toBe(
      "no_candidates",
    );
  });

  it("후보는 있지만 제목이 빈 게 있으면 missing_title", () => {
    expect(confirmDisabledReason({ ...ALL_FILLED, hasEmptyTitle: true })).toBe(
      "missing_title",
    );
  });

  it("제목은 있지만 설명이 빈 게 있으면 missing_description", () => {
    expect(
      confirmDisabledReason({ ...ALL_FILLED, hasEmptyDescription: true }),
    ).toBe("missing_description");
  });

  it("제목·설명은 다 있지만 주제·태그 이름이 빈 게 있으면 empty_label", () => {
    expect(confirmDisabledReason({ ...ALL_FILLED, hasEmptyLabel: true })).toBe(
      "empty_label",
    );
  });

  it("제목·설명·라벨은 다 있지만 신규 Reference 필드가 빈 게 있으면 empty_reference", () => {
    expect(
      confirmDisabledReason({ ...ALL_FILLED, hasEmptyReference: true }),
    ).toBe("empty_reference");
  });

  it("후보가 있고 제목·설명·라벨·레퍼런스 다 있으면 null(비활성 아님)", () => {
    expect(confirmDisabledReason(ALL_FILLED)).toBeNull();
  });

  it("후보가 없으면 다른 문제와 무관하게 no_candidates가 우선", () => {
    expect(
      confirmDisabledReason({
        hasCandidates: false,
        hasEmptyTitle: true,
        hasEmptyDescription: true,
        hasEmptyLabel: true,
        hasEmptyReference: true,
      }),
    ).toBe("no_candidates");
  });

  it("제목이 비어 있으면 다른 문제보다 missing_title이 우선", () => {
    expect(
      confirmDisabledReason({
        hasCandidates: true,
        hasEmptyTitle: true,
        hasEmptyDescription: true,
        hasEmptyLabel: true,
        hasEmptyReference: true,
      }),
    ).toBe("missing_title");
  });

  it("설명이 비어 있으면 라벨 문제보다 missing_description이 우선", () => {
    expect(
      confirmDisabledReason({
        hasCandidates: true,
        hasEmptyTitle: false,
        hasEmptyDescription: true,
        hasEmptyLabel: true,
        hasEmptyReference: true,
      }),
    ).toBe("missing_description");
  });

  it("라벨이 비어 있으면 레퍼런스 문제보다 empty_label이 우선", () => {
    expect(
      confirmDisabledReason({
        hasCandidates: true,
        hasEmptyTitle: false,
        hasEmptyDescription: false,
        hasEmptyLabel: true,
        hasEmptyReference: true,
      }),
    ).toBe("empty_label");
  });
});

describe("runConfirmReview", () => {
  it("펜딩 저장을 먼저 끝낸 뒤 confirmReview를 부른다", async () => {
    const calls: string[] = [];
    const flushPendingSave = vi.fn().mockImplementation(async () => {
      calls.push("flush");
    });
    const confirmReview = vi.fn().mockImplementation(async () => {
      calls.push("confirm");
    });

    await runConfirmReview({
      changesetId: "cs-1",
      flushPendingSave,
      confirmReview,
    });

    expect(calls).toEqual(["flush", "confirm"]);
    expect(confirmReview).toHaveBeenCalledWith({ changesetId: "cs-1" });
  });

  it("펜딩 저장이 없어도(no-op) confirmReview는 그대로 불린다", async () => {
    const flushPendingSave = vi.fn().mockResolvedValue(undefined);
    const confirmReview = vi.fn().mockResolvedValue(undefined);

    await runConfirmReview({
      changesetId: "cs-1",
      flushPendingSave,
      confirmReview,
    });

    expect(flushPendingSave).toHaveBeenCalledOnce();
    expect(confirmReview).toHaveBeenCalledWith({ changesetId: "cs-1" });
  });

  it("펜딩 저장이 실패하면 confirmReview는 아예 호출되지 않는다", async () => {
    const flushPendingSave = vi
      .fn()
      .mockRejectedValue(new Error("save failed"));
    const confirmReview = vi.fn();

    await expect(
      runConfirmReview({
        changesetId: "cs-1",
        flushPendingSave,
        confirmReview,
      }),
    ).rejects.toThrow("save failed");

    expect(confirmReview).not.toHaveBeenCalled();
  });
});

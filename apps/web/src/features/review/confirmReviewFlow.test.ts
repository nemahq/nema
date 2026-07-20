import { describe, expect, it, vi } from "vitest";

import { confirmDisabledReason, runConfirmReview } from "./confirmReviewFlow";
import type { ReviewDigest, ReviewNewReference } from "./types";

function noop() {}

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
    expect(confirmDisabledReason(false, false, false, false)).toBe(
      "no_candidates",
    );
  });

  it("후보는 있지만 제목이 빈 게 있으면 missing_title", () => {
    expect(confirmDisabledReason(true, true, false, false)).toBe(
      "missing_title",
    );
  });

  it("제목은 다 있지만 주제·태그 이름이 빈 게 있으면 empty_label", () => {
    expect(confirmDisabledReason(true, false, true, false)).toBe("empty_label");
  });

  it("제목·라벨은 다 있지만 신규 Reference 필드가 빈 게 있으면 empty_reference", () => {
    expect(confirmDisabledReason(true, false, false, true)).toBe(
      "empty_reference",
    );
  });

  it("후보가 있고 제목·라벨·레퍼런스 다 있으면 null(비활성 아님)", () => {
    expect(confirmDisabledReason(true, false, false, false)).toBeNull();
  });

  it("후보가 없으면 다른 문제와 무관하게 no_candidates가 우선", () => {
    expect(confirmDisabledReason(false, true, true, true)).toBe(
      "no_candidates",
    );
  });

  it("제목이 비어 있으면 라벨 문제보다 missing_title이 우선", () => {
    expect(confirmDisabledReason(true, true, true, true)).toBe("missing_title");
  });

  it("라벨이 비어 있으면 레퍼런스 문제보다 empty_label이 우선", () => {
    expect(confirmDisabledReason(true, false, true, true)).toBe("empty_label");
  });
});

describe("runConfirmReview", () => {
  it("dirty하면 편집(제목·타입 body·라벨)을 저장한 뒤 confirmReview를 부른다", async () => {
    const calls: string[] = [];
    const updateReview = vi.fn().mockImplementation(async () => {
      calls.push("update");
    });
    const confirmReview = vi.fn().mockImplementation(async () => {
      calls.push("confirm");
    });

    // 타입 변경 초기화 결과 — 원본 DIGEST.body(decision)와 다른 빈 body가 실려야 한다.
    const overriddenBody: ReviewDigest["body"] = { type: "learning" };
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
          body: overriddenBody,
          topics: overriddenTopics,
          tags: overriddenTags,
        },
      ],
      newReferences: [],
      referenceUpdates: [],
      updateReview,
      confirmReview,
      onSaved: noop,
    });

    expect(calls).toEqual(["update", "confirm"]);
    expect(updateReview).toHaveBeenCalledWith({
      changesetId: "cs-1",
      digests: [
        {
          ...DIGEST,
          title: "새 제목",
          body: overriddenBody,
          topics: overriddenTopics,
          tags: overriddenTags,
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
      key: "ref-1",
      type: "person",
      title: "  홍길동  ",
      body: "  조선의 의적  ",
      externalUrls: [],
    };

    await runConfirmReview({
      changesetId: "cs-1",
      dirty: true,
      digestRows: [
        {
          digest: DIGEST,
          title: DIGEST.title,
          body: DIGEST.body,
          topics: [],
          tags: [],
        },
      ],
      newReferences: [editedReference],
      referenceUpdates: [],
      updateReview,
      confirmReview,
      onSaved: noop,
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
      changesetId: "cs-1",
      dirty: true,
      digestRows: [
        {
          digest: DIGEST,
          title: DIGEST.title,
          body: DIGEST.body,
          topics: [],
          tags: [],
        },
      ],
      newReferences: [],
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
      onSaved: noop,
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
      changesetId: "cs-1",
      dirty: false,
      digestRows: [
        {
          digest: DIGEST,
          title: DIGEST.title,
          body: DIGEST.body,
          topics: [],
          tags: [],
        },
      ],
      newReferences: [],
      referenceUpdates: [],
      updateReview,
      confirmReview,
      onSaved: noop,
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
          {
            digest: DIGEST,
            title: DIGEST.title,
            body: DIGEST.body,
            topics: [],
            tags: [],
          },
        ],
        newReferences: [],
        referenceUpdates: [],
        updateReview,
        confirmReview,
        onSaved: noop,
      }),
    ).rejects.toThrow("save failed");

    expect(confirmReview).not.toHaveBeenCalled();
  });

  // 저장 RPC가 changes를 전량 재삽입해 digests 순서를 다시 섞는다. 인덱스로 키를 잡은
  // 편집 상태를 그때 버리지 않으면, 확정이 뒤이어 실패해 화면에 머무를 때 남은
  // override가 다른 후보에 붙는다 — 화면도 서버도 에러를 내지 않는 조용한 오염이다.
  it("저장에 성공하면 확정 결과와 무관하게 편집 상태를 버린다", async () => {
    const updateReview = vi.fn().mockResolvedValue(undefined);
    const confirmReview = vi
      .fn()
      .mockRejectedValue(new Error("confirm failed"));
    const onSaved = vi.fn();

    await expect(
      runConfirmReview({
        changesetId: "cs-1",
        dirty: true,
        digestRows: [
          {
            digest: DIGEST,
            title: DIGEST.title,
            body: DIGEST.body,
            topics: [],
            tags: [],
          },
        ],
        newReferences: [],
        referenceUpdates: [],
        updateReview,
        confirmReview,
        onSaved,
      }),
    ).rejects.toThrow("confirm failed");

    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("저장할 게 없으면 편집 상태를 건드리지 않는다", async () => {
    const onSaved = vi.fn();

    await runConfirmReview({
      changesetId: "cs-1",
      dirty: false,
      digestRows: [],
      newReferences: [],
      referenceUpdates: [],
      updateReview: vi.fn(),
      confirmReview: vi.fn(),
      onSaved,
    });

    expect(onSaved).not.toHaveBeenCalled();
  });
});

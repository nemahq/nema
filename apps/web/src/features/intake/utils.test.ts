import { describe, expect, it } from "vitest";

import type { PendingSourceItem } from "@web/features/intake/types";
import { draftStatus, isDraftItem } from "@web/features/intake/utils";

function buildSource(
  overrides: Partial<PendingSourceItem> = {},
): PendingSourceItem {
  return {
    sourceId: "source-1",
    spaceId: "space-1",
    body: "본문",
    createdAt: "2026-07-12T00:00:00.000Z",
    digestionStatus: "pending",
    errorMessage: null,
    reviewChangesetId: null,
    digestCount: 0,
    ...overrides,
  };
}

describe("draftStatus", () => {
  it("reviewChangesetId가 있으면 digestionStatus와 무관하게 null(초안 아님)", () => {
    expect(
      draftStatus(
        buildSource({
          digestionStatus: "completed",
          reviewChangesetId: "cs-1",
        }),
      ),
    ).toBeNull();
  });

  it("pending이면 processing", () => {
    expect(draftStatus(buildSource({ digestionStatus: "pending" }))).toBe(
      "processing",
    );
  });

  it("failed면 failed", () => {
    expect(draftStatus(buildSource({ digestionStatus: "failed" }))).toBe(
      "failed",
    );
  });

  it("completed + reviewChangesetId 없음이면 empty", () => {
    expect(draftStatus(buildSource({ digestionStatus: "completed" }))).toBe(
      "empty",
    );
  });

  it("cancelled면 cancelled", () => {
    expect(draftStatus(buildSource({ digestionStatus: "cancelled" }))).toBe(
      "cancelled",
    );
  });
});

describe("isDraftItem", () => {
  it("draftStatus가 null이 아니면 true", () => {
    expect(isDraftItem(buildSource({ digestionStatus: "pending" }))).toBe(true);
  });

  it("reviewChangesetId가 있으면 false", () => {
    expect(isDraftItem(buildSource({ reviewChangesetId: "cs-1" }))).toBe(false);
  });
});

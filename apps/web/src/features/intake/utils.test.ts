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
    title: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    digestionOutcome: "processing",
    lastDigestionAttempt: null,
    digestionStartedAt: null,
    inputChangedSinceDigestion: false,
    errorMessage: null,
    review: null,
    digestCount: 0,
    ...overrides,
  };
}

describe("draftStatus", () => {
  it("review가 있으면 digestionOutcome과 무관하게 null(초안 아님)", () => {
    expect(
      draftStatus(
        buildSource({
          digestionOutcome: "empty",
          review: { changesetId: "cs-1", changesetNumber: 1 },
        }),
      ),
    ).toBeNull();
  });

  it("review가 없으면 서버가 조합한 digestionOutcome을 그대로 통과시킨다", () => {
    expect(draftStatus(buildSource({ digestionOutcome: "discarded" }))).toBe(
      "discarded",
    );
  });
});

describe("isDraftItem", () => {
  it("draftStatus가 null이 아니면 true", () => {
    expect(isDraftItem(buildSource({ digestionOutcome: "processing" }))).toBe(
      true,
    );
  });

  it("review가 있으면 false", () => {
    expect(
      isDraftItem(
        buildSource({ review: { changesetId: "cs-1", changesetNumber: 1 } }),
      ),
    ).toBe(false);
  });
});

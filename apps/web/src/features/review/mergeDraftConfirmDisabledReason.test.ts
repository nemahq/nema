import { describe, expect, it } from "vitest";

import type { DigestDraft } from "@nema-io/shared";

import { mergeDraftConfirmDisabledReason } from "./mergeDraftConfirmDisabledReason";

function draft(overrides: Partial<DigestDraft> = {}): DigestDraft {
  return {
    title: "제목",
    description: "설명",
    body: { type: "decision" },
    topics: [],
    tags: [],
    referenceIds: [],
    newReferenceKeys: [],
    externalUrls: [],
    ...overrides,
  };
}

describe("mergeDraftConfirmDisabledReason", () => {
  it("초안이 없으면 no_draft", () => {
    expect(mergeDraftConfirmDisabledReason(null)).toBe("no_draft");
  });

  it("제목이 비어 있으면 missing_title", () => {
    expect(mergeDraftConfirmDisabledReason(draft({ title: "  " }))).toBe(
      "missing_title",
    );
  });

  it("설명이 비어 있으면 missing_description", () => {
    expect(mergeDraftConfirmDisabledReason(draft({ description: "" }))).toBe(
      "missing_description",
    );
  });

  it("제목·설명이 다 있으면 null", () => {
    expect(mergeDraftConfirmDisabledReason(draft())).toBeNull();
  });
});

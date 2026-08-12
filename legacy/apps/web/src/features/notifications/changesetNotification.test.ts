import { describe, expect, it } from "vitest";

import {
  type ChangesetInsertRow,
  needsReviewNotification,
  resolveSpacePublicId,
} from "./changesetNotification";

function buildRow(overrides: Partial<ChangesetInsertRow>): ChangesetInsertRow {
  return {
    id: "changeset-1",
    space_id: "space-1",
    number: 1,
    type: "ingestion",
    status: "open",
    ...overrides,
  };
}

describe("needsReviewNotification", () => {
  it("ingestion + open + space_id 있음 — 통과", () => {
    expect(needsReviewNotification(buildRow({}))).toBe(true);
  });

  it("relation + open(판정 대기) — 통과", () => {
    expect(
      needsReviewNotification(buildRow({ type: "relation", status: "open" })),
    ).toBe(true);
  });

  it("relation + closed(확신 매칭 자동 적용) — 거른다", () => {
    expect(
      needsReviewNotification(buildRow({ type: "relation", status: "closed" })),
    ).toBe(false);
  });

  it("manual — 항상 closed라 거른다", () => {
    expect(
      needsReviewNotification(buildRow({ type: "manual", status: "closed" })),
    ).toBe(false);
  });

  it("space_id가 null — 딥링크할 space가 없어 거른다", () => {
    expect(needsReviewNotification(buildRow({ space_id: null }))).toBe(false);
  });

  it("number가 null — 딥링크할 번호가 없어 거른다", () => {
    expect(needsReviewNotification(buildRow({ number: null }))).toBe(false);
  });
});

describe("resolveSpacePublicId", () => {
  const spaces = [
    { id: "space-1", publicId: "pub-1" },
    { id: "space-2", publicId: "pub-2" },
  ];

  it("id가 일치하는 space의 publicId를 찾는다", () => {
    expect(resolveSpacePublicId(spaces, "space-2")).toBe("pub-2");
  });

  it("일치하는 space가 없으면 undefined", () => {
    expect(resolveSpacePublicId(spaces, "space-9")).toBeUndefined();
  });

  it("캐시가 아직 없으면(undefined) undefined", () => {
    expect(resolveSpacePublicId(undefined, "space-1")).toBeUndefined();
  });
});

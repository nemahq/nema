import { describe, expect, it } from "vitest";

import {
  type ChangesetInsertRow,
  isIngestionChangeset,
  resolveSpacePublicId,
} from "./changesetNotification";

function buildRow(overrides: Partial<ChangesetInsertRow>): ChangesetInsertRow {
  return {
    id: "changeset-1",
    space_id: "space-1",
    type: "ingestion",
    ...overrides,
  };
}

describe("isIngestionChangeset", () => {
  it("ingestion type + space_id 있음 — 통과", () => {
    expect(isIngestionChangeset(buildRow({}))).toBe(true);
  });

  it("relation type — 리뷰 화면이 거절하므로 알림도 거른다", () => {
    expect(isIngestionChangeset(buildRow({ type: "relation" }))).toBe(false);
  });

  it("manual type — 거른다", () => {
    expect(isIngestionChangeset(buildRow({ type: "manual" }))).toBe(false);
  });

  it("space_id가 null — 딥링크할 space가 없어 거른다", () => {
    expect(isIngestionChangeset(buildRow({ space_id: null }))).toBe(false);
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

import { describe, expect, it } from "vitest";

import type { ReferenceSummary } from "@web/features/reference/types";

import {
  DEFAULT_REFERENCE_LIST_FILTER,
  filterReferences,
  sortReferences,
} from "./referenceListFilters";

function makeReference(
  overrides: Partial<ReferenceSummary> & Pick<ReferenceSummary, "id" | "title">,
): ReferenceSummary {
  return {
    type: "term",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterReferences", () => {
  it("기본 상태 필터(active)는 archived 항목을 목록에서 뺀다 — 결정 #12", () => {
    const references = [
      makeReference({ id: "1", title: "활성" }),
      makeReference({ id: "2", title: "보관됨", status: "archived" }),
    ];

    const result = filterReferences(references, DEFAULT_REFERENCE_LIST_FILTER);

    expect(result.map((r) => r.id)).toEqual(["1"]);
  });

  it("검색어는 대소문자 구분 없이 이름에 포함되는지로 매칭한다", () => {
    const references = [
      makeReference({ id: "1", title: "Tiro" }),
      makeReference({ id: "2", title: "레드" }),
    ];

    const result = filterReferences(references, {
      ...DEFAULT_REFERENCE_LIST_FILTER,
      search: "tiro",
    });

    expect(result.map((r) => r.id)).toEqual(["1"]);
  });

  it("타입 필터는 그 타입만 남긴다", () => {
    const references = [
      makeReference({ id: "1", title: "A", type: "person" }),
      makeReference({ id: "2", title: "B", type: "term" }),
    ];

    const result = filterReferences(references, {
      ...DEFAULT_REFERENCE_LIST_FILTER,
      status: "all",
      type: "person",
    });

    expect(result.map((r) => r.id)).toEqual(["1"]);
  });
});

describe("sortReferences", () => {
  it("이름 오름차순은 가나다순으로 정렬한다 — 사전·위키 찾아보기 목적(surface-inventory.md)", () => {
    const references = [
      makeReference({ id: "b", title: "브이라운지" }),
      makeReference({ id: "a", title: "레드" }),
    ];

    const result = sortReferences(references, "title", "asc");

    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

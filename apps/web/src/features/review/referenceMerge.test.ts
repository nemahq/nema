import { describe, expect, it } from "vitest";

import { buildMergeRows, toReferenceUpdates } from "./referenceMerge";
import type { ReviewCitedReference } from "./types";

const REF_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REF_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const REF_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const cited = (id: string, mergeNote: string | null): ReviewCitedReference => ({
  id,
  type: "person",
  title: `ref-${id.slice(0, 4)}`,
  body: `원본 ${id.slice(0, 4)}`,
  mergeNote,
});

describe("buildMergeRows", () => {
  it("병합 제안(mergeNote != null)이 있는 인용만 남기고 단순 인용은 뺀다", () => {
    const rows = buildMergeRows({
      citedReferences: [cited(REF_A, "제안 A"), cited(REF_B, null)],
      citedReferenceIds: new Set([REF_A, REF_B]),
      mergeNoteOverrides: new Map(),
    });

    expect(rows.map((row) => row.reference.id)).toEqual([REF_A]);
    expect(rows[0].mergeNote).toBe("제안 A");
  });

  it("살아있는 Digest가 더 이상 인용하지 않는 제안은 제외한다", () => {
    const rows = buildMergeRows({
      citedReferences: [cited(REF_A, "제안 A"), cited(REF_C, "제안 C")],
      // REF_C를 인용하던 Digest가 전부 삭제돼 view에서 빠진 상황
      citedReferenceIds: new Set([REF_A]),
      mergeNoteOverrides: new Map(),
    });

    expect(rows.map((row) => row.reference.id)).toEqual([REF_A]);
  });

  it("override가 있으면 엔진 제안 대신 편집값을 쓴다", () => {
    const rows = buildMergeRows({
      citedReferences: [cited(REF_A, "엔진 원안"), cited(REF_B, "그대로")],
      citedReferenceIds: new Set([REF_A, REF_B]),
      mergeNoteOverrides: new Map([[REF_A, "사람이 고친 값"]]),
    });

    expect(rows).toEqual([
      { reference: cited(REF_A, "엔진 원안"), mergeNote: "사람이 고친 값" },
      { reference: cited(REF_B, "그대로"), mergeNote: "그대로" },
    ]);
  });

  it('"원래대로"(override=원본 body)는 목록에 남되 원본 값을 그대로 반영한다', () => {
    // 거부는 카드를 빼는 게 아니라 override를 원본 body로 되돌려 병합을 no-op으로 만든다.
    const refA = cited(REF_A, "엔진 제안");
    const rows = buildMergeRows({
      citedReferences: [refA],
      citedReferenceIds: new Set([REF_A]),
      mergeNoteOverrides: new Map([[REF_A, refA.body]]),
    });

    expect(rows).toEqual([{ reference: refA, mergeNote: refA.body }]);
  });
});

describe("toReferenceUpdates", () => {
  it("편집 여부와 무관하게 살아있는 병합 후보 전량을 페이로드로 만든다", () => {
    const rows = buildMergeRows({
      citedReferences: [cited(REF_A, "엔진 원안"), cited(REF_B, "손 안 댐")],
      citedReferenceIds: new Set([REF_A, REF_B]),
      mergeNoteOverrides: new Map([[REF_A, "고친 값"]]),
    });

    expect(toReferenceUpdates(rows)).toEqual([
      { referenceId: REF_A, mergeNote: "고친 값" },
      { referenceId: REF_B, mergeNote: "손 안 댐" },
    ]);
  });
});

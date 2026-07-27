import { describe, expect, it } from "vitest";

import { selectMergeCandidates, toReferenceUpdates } from "./referenceMerge";
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

describe("selectMergeCandidates", () => {
  it("병합 제안(mergeNote != null)이 있는 인용만 남기고 단순 인용은 뺀다", () => {
    const candidates = selectMergeCandidates({
      citedReferences: [cited(REF_A, "제안 A"), cited(REF_B, null)],
      citedReferenceIds: new Set([REF_A, REF_B]),
    });

    expect(candidates.map((reference) => reference.id)).toEqual([REF_A]);
  });

  it("살아있는 Digest가 더 이상 인용하지 않는 제안은 제외한다", () => {
    const candidates = selectMergeCandidates({
      citedReferences: [cited(REF_A, "제안 A"), cited(REF_C, "제안 C")],
      // REF_C를 인용하던 Digest가 전부 삭제돼 초안에서 빠진 상황
      citedReferenceIds: new Set([REF_A]),
    });

    expect(candidates.map((reference) => reference.id)).toEqual([REF_A]);
  });

  it('"원래대로"(병합 설명=원본 body)도 목록에 남는다', () => {
    // 거부는 카드를 빼는 게 아니라 병합 설명을 원본 body로 되돌려 no-op으로 만든다.
    const refA = cited(REF_A, "엔진 제안");
    const restored: ReviewCitedReference = { ...refA, mergeNote: refA.body };

    const candidates = selectMergeCandidates({
      citedReferences: [restored],
      citedReferenceIds: new Set([REF_A]),
    });

    expect(candidates).toEqual([restored]);
  });
});

describe("toReferenceUpdates", () => {
  it("편집 여부와 무관하게 살아있는 병합 후보 전량을 페이로드로 만든다", () => {
    const candidates = selectMergeCandidates({
      citedReferences: [cited(REF_A, "고친 값"), cited(REF_B, "손 안 댐")],
      citedReferenceIds: new Set([REF_A, REF_B]),
    });

    expect(toReferenceUpdates(candidates)).toEqual([
      { referenceId: REF_A, mergeNote: "고친 값" },
      { referenceId: REF_B, mergeNote: "손 안 댐" },
    ]);
  });
});

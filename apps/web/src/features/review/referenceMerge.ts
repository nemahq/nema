import type { ReferenceMergeUpdate } from "@nema-io/shared";

import type { ReviewCitedReference } from "./types";

interface MergeRow {
  reference: ReviewCitedReference;
  mergeNote: string;
}

// 병합 편집 대상 후보를 고른다 — 엔진 병합 제안이 있고(mergeNote != null, 단순 인용은
// 편집할 게 없다), 살아있는 Digest가 아직 그 Reference를 인용하는 것만(인용하던 후보를
// 다 지우면 병합도 의미를 잃는다). 제안 거부는 별도로 빼지 않는다 — "원래대로"가
// mergeNote를 원본 body로 되돌리면 RPC의 before===after no-op으로 병합이 안 걸린다.
// UI 렌더와 저장 페이로드(referenceUpdates)가 같은 목록을 쓰도록 한 곳에서 계산한다 —
// update_pending_ingestion이 changes를 통째로 교체하므로, 여기서 빠진 제안은 확정 시 유실된다.
export function buildMergeRows(args: {
  citedReferences: ReviewCitedReference[];
  citedReferenceIds: Set<string>;
  mergeNoteOverrides: ReadonlyMap<string, string>;
}): MergeRow[] {
  const { citedReferences, citedReferenceIds, mergeNoteOverrides } = args;
  return citedReferences
    .filter(
      (reference) =>
        reference.mergeNote !== null && citedReferenceIds.has(reference.id),
    )
    .map((reference) => ({
      reference,
      mergeNote:
        mergeNoteOverrides.get(reference.id) ?? reference.mergeNote ?? "",
    }));
}

// 편집 여부와 무관하게 살아있는 병합 후보 전량을 저장 페이로드로 — 전체 교체 구조에서
// 손대지 않은 엔진 제안이 유실되지 않게 한다(trim은 확정 흐름이 최종적으로 한 번 더 한다).
export function toReferenceUpdates(
  mergeRows: MergeRow[],
): ReferenceMergeUpdate[] {
  return mergeRows.map((row) => ({
    referenceId: row.reference.id,
    mergeNote: row.mergeNote,
  }));
}
